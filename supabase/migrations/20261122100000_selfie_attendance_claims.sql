-- T-060 (FL-049, FL-050): selfie attendance claims.
-- A student submits a claim with a selfie; event_attendance changes only when a
-- Council member (E/O/R) other than the claimant verifies it. The recorded time is
-- the submission time. QR, manual or CSV capture of the same side supersedes the
-- pending claim. A photo is readable only while its claim is pending; the app
-- deletes the object afterwards and records photo_deleted_at.
begin;

-- Vocabularies. Constraint names are the Postgres defaults from the structure migration.
alter table public.files drop constraint files_purpose_check,
    add constraint files_purpose_check
    check (purpose in ('roster_import', 'payment_proof', 'payment_account_qr', 'attendance_selfie'));
alter table public.event_attendance drop constraint event_attendance_time_in_method_check,
    add constraint event_attendance_time_in_method_check check (time_in_method in ('qr', 'manual', 'csv', 'selfie'));
alter table public.event_attendance drop constraint event_attendance_time_out_method_check,
    add constraint event_attendance_time_out_method_check check (time_out_method in ('qr', 'manual', 'csv', 'selfie'));

create table public.event_attendance_claims (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null,
    student_id uuid not null,
    kind text not null check (kind in ('time_in', 'time_out')),
    file_id uuid not null unique references public.files on delete restrict,
    submitted_at timestamptz not null,
    consented_at timestamptz not null,
    consent_version text not null check (btrim(consent_version) <> '' and length(consent_version) <= 40),
    status text not null default 'pending' check (status in ('pending', 'verified', 'rejected', 'superseded')),
    reviewed_by uuid references public.profiles on delete restrict,
    reviewed_at timestamptz,
    rejection_reason text check (btrim(rejection_reason) <> '' and length(rejection_reason) <= 500),
    photo_deleted_at timestamptz,
    created_at timestamptz not null default now(),
    -- A claim belongs to a preserved participant row, so it can never create eligibility.
    foreign key (event_id, student_id) references public.event_attendance (event_id, student_id) on delete restrict,
    check ((status = 'pending') = (reviewed_at is null)),
    check ((status in ('verified', 'rejected')) = (reviewed_by is not null)),
    check ((status = 'rejected') = (rejection_reason is not null)),
    check (reviewed_by is distinct from student_id),
    check (photo_deleted_at is null or status <> 'pending')
);
create unique index event_attendance_claims_one_open
    on public.event_attendance_claims (event_id, student_id, kind) where status in ('pending', 'verified');
create index event_attendance_claims_queue on public.event_attendance_claims (event_id, status);

-- Facts are immutable. Status leaves pending once; afterwards only
-- photo_deleted_at may be set, once.
create function f_access_private.claim_guard() returns trigger
language plpgsql security definer set search_path = pg_catalog as $$
begin
    if TG_OP = 'DELETE' then raise exception 'Attendance claim history cannot be deleted' using errcode = '23514'; end if;
    if (to_jsonb(new) - array['status', 'reviewed_by', 'reviewed_at', 'rejection_reason', 'photo_deleted_at'])
        is distinct from (to_jsonb(old) - array['status', 'reviewed_by', 'reviewed_at', 'rejection_reason', 'photo_deleted_at']) then
        raise exception 'Attendance claim facts cannot change' using errcode = '23514';
    end if;
    if old.status <> 'pending' and (old.photo_deleted_at is not null
        or (to_jsonb(new) - 'photo_deleted_at') is distinct from (to_jsonb(old) - 'photo_deleted_at')) then
        raise exception 'Reviewed attendance claim cannot change' using errcode = '23514';
    end if;
    return new;
end $$;
create trigger claim_history before update or delete on public.event_attendance_claims
    for each row execute function f_access_private.claim_guard();

alter table public.event_attendance_claims enable row level security;
create policy claims_read on public.event_attendance_claims for select to authenticated using (
    student_id = (select f_access_private.me()) or (select f_access_private.council(true)));
revoke all on public.event_attendance_claims from public, anon, authenticated, service_role;
grant select on public.event_attendance_claims to authenticated;
grant select, insert, update on public.event_attendance_claims to service_role;

-- Known capture methods win: recording a side by QR, manual or CSV supersedes the
-- pending claim for that side in the same transaction. Every capture path updates
-- event_attendance, so one trigger covers them all.
create function f_access_private.supersede_claims() returns trigger
language plpgsql security definer set search_path = pg_catalog as $$
begin
    update public.event_attendance_claims c set status = 'superseded', reviewed_at = now()
    where c.event_id = new.event_id and c.student_id = new.student_id and c.status = 'pending'
        and ((c.kind = 'time_in' and old.time_in is null and new.time_in is not null and new.time_in_method <> 'selfie')
          or (c.kind = 'time_out' and old.time_out is null and new.time_out is not null and new.time_out_method <> 'selfie'));
    return null;
end $$;
create trigger supersede_claims after update of time_in, time_out on public.event_attendance
    for each row execute function f_access_private.supersede_claims();

-- Same as 20261120100000, plus the attendance_claim_rejected notification kind.
create or replace function f_access_private.reference_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if TG_TABLE_NAME='payments' then
  if new.decided_by=new.student_id or (new.method='cash' and new.submitted_by=new.student_id) then raise exception 'Self payment recording/decision forbidden'; end if;
  if new.proof_file_id is not null and not exists(select 1 from public.files f where f.id=new.proof_file_id and f.purpose='payment_proof' and f.uploader_id=new.student_id) then raise exception 'Proof must be the student payment-proof file'; end if;
  if new.method='transfer' and new.supersedes_payment_id is null and not exists(select 1 from public.payment_accounts a where a.id=new.payment_account_id and a.archived_at is null
   and a.label=new.destination_label and a.account_name=new.destination_account_name and a.account_reference=new.destination_account_reference for share) then raise exception 'Active destination snapshot required'; end if;
 elsif TG_TABLE_NAME='payment_accounts' then
  if new.qr_file_id is not null and not exists(select 1 from public.files f where f.id=new.qr_file_id and f.purpose='payment_account_qr') then raise exception 'Invalid payment destination QR purpose'; end if;
 elsif TG_TABLE_NAME='roster_imports' then
  if not exists(select 1 from public.files f where f.id=new.file_id and f.purpose='roster_import') then raise exception 'Invalid roster import file purpose'; end if;
 elsif TG_TABLE_NAME='invitations' then
  if TG_OP='UPDATE' then
   if old.status<>'pending' or new.status='pending' or (to_jsonb(new)-array['status','accepted_at','cancelled_at']) is distinct from (to_jsonb(old)-array['status','accepted_at','cancelled_at']) then raise exception 'Only final invitation transition allowed'; end if;
   if new.status='accepted' and (new.accepted_at>=new.expires_at or new.accepted_at<new.created_at or new.expires_at<=clock_timestamp()) then raise exception 'Invitation expired or invalid acceptance time'; end if;
   if new.status='expired' and old.expires_at>clock_timestamp() then raise exception 'Invitation has not reached its deadline'; end if;
  else
   if new.status<>'pending' then raise exception 'New invitation must be pending'; end if;
   if (new.purpose='faculty_access') is distinct from exists(select 1 from public.profiles p where p.id=new.profile_id and p.university_id is null) then
    raise exception 'Invitation purpose does not match profile category'; end if;
  end if;
 elsif TG_TABLE_NAME='notifications' then
  if new.kind not in ('merit_received','demerit_incurred','service_recorded','obligation_due','payment_verified','payment_rejected','council_access_changed','obligation_waived','attendance_claim_rejected')
   or new.target_type is not null then raise exception 'Unapproved notification category/navigation'; end if;
 end if;
 return new;
end $$;

-- Same as 20261120100000, plus attendance_claim_rejected.
create or replace function public.f_cmd_notice(p_student uuid, p_kind text) returns void
language plpgsql security definer set search_path = pg_catalog as $$
declare v_message text;
begin
    v_message := case p_kind
        when 'merit_received' then 'A merit award was recorded. View your records.'
        when 'demerit_incurred' then 'A demerit was recorded. View your records.'
        when 'service_recorded' then 'Service completion was recorded. View your records.'
        when 'obligation_due' then 'An obligation was recorded. View your account.'
        when 'obligation_waived' then 'An obligation was waived. View your account.'
        when 'payment_verified' then 'Your payment was verified. View your account.'
        when 'payment_rejected' then 'Your payment submission was rejected. View your account.'
        when 'attendance_claim_rejected' then 'Your attendance photo was rejected. View the event.'
        else null end;
    if v_message is null then raise exception 'Unsupported command notification kind'; end if;
    insert into public.notifications(recipient_id, kind, message) values (p_student, p_kind, v_message);
end $$;

-- Shared capture helper (20261113060000) with an optional recorded time. A verified
-- claim records its submission time; every other caller passes null (the clock).
create function public.f_cmd_record_attendance(p_actor uuid, p_event uuid, p_student uuid,
    p_kind text, p_method text, p_at timestamptz) returns timestamptz
language plpgsql security definer set search_path = pg_catalog as $$
declare e public.events%rowtype; a public.event_attendance%rowtype; v_now timestamptz;
begin
    select * into e from public.events where id = p_event for update;
    if not found then raise exception 'Event not found' using errcode = '22023'; end if;
    if e.audience_frozen_at is null then raise exception 'Event is not published' using errcode = '55000'; end if;
    if e.archived_at is not null then raise exception 'Event is archived' using errcode = '55000'; end if;
    if e.attendance_locked_at is not null then raise exception 'Event attendance is locked' using errcode = '55000'; end if;
    if p_student = p_actor then raise exception 'Self attendance recording is forbidden' using errcode = '42501'; end if;

    select * into a from public.event_attendance where event_id = e.id and student_id = p_student for update;
    if not found then raise exception 'Student is not in preserved event audience' using errcode = '22023'; end if;
    v_now := coalesce(p_at, clock_timestamp());

    if p_kind = 'time_in' then
        if a.time_in is not null then raise exception 'Time-in already recorded' using errcode = '23505'; end if;
        if not (v_now between e.time_in_from and e.time_in_until) then
            raise exception 'Outside the time-in window' using errcode = '22023'; end if;
        update public.event_attendance set time_in = v_now, time_in_method = p_method,
            time_in_recorded_by = p_actor, updated_at = now() where id = a.id;
    else
        if a.time_in is null then raise exception 'Time-in not recorded' using errcode = '22023'; end if;
        if a.time_out is not null then raise exception 'Time-out already recorded' using errcode = '23505'; end if;
        if e.time_out_from is null or not (v_now between e.time_out_from and e.time_out_until) then
            raise exception 'Outside the time-out window' using errcode = '22023'; end if;
        if v_now <= a.time_in then raise exception 'Time-out must be after time-in' using errcode = '22023'; end if;
        update public.event_attendance set time_out = v_now, time_out_method = p_method,
            time_out_recorded_by = p_actor, updated_at = now() where id = a.id;
    end if;
    return v_now;
end $$;

-- Old signature kept for its callers; same behavior.
create or replace function public.f_cmd_record_attendance(p_actor uuid, p_event uuid, p_student uuid,
    p_kind text, p_method text) returns timestamptz
language sql security definer set search_path = pg_catalog as $$
    select public.f_cmd_record_attendance(p_actor, p_event, p_student, p_kind, p_method, null::timestamptz)
$$;

-- FL-049. The typed number is a typo guard checked against the actor's own profile.
-- It is not stored, and it stays out of the request payload.
create function public.submit_attendance_claim(p_key uuid, p_actor uuid, p_event uuid,
    p_university_id text, p_kind text, p_file uuid, p_consent_version text) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare e public.events%rowtype; a public.event_attendance%rowtype; v_result jsonb;
    v_now timestamptz; v_id uuid;
begin
    perform public.f_cmd_actor(p_actor);
    if p_kind is null or p_kind not in ('time_in', 'time_out') or p_event is null or p_file is null
        or p_university_id is null or p_university_id !~ '^[0-9]{2}-1-[0-9]{5}$' then
        raise exception 'Invalid attendance claim' using errcode = '22023';
    end if;
    if p_consent_version is null or btrim(p_consent_version) = '' then
        raise exception 'Consent is required' using errcode = '22023';
    end if;
    v_result := public.f_cmd_begin(p_key, 'submit_attendance_claim', p_actor, jsonb_build_object(
        'event', p_event, 'kind', p_kind, 'file', p_file, 'consent_version', p_consent_version));
    if v_result is not null then return v_result; end if;

    select * into e from public.events where id = p_event for update;
    if not found then raise exception 'Event not found' using errcode = '22023'; end if;
    if e.audience_frozen_at is null then raise exception 'Event is not published' using errcode = '55000'; end if;
    if e.archived_at is not null then raise exception 'Event is archived' using errcode = '55000'; end if;
    if e.attendance_locked_at is not null then raise exception 'Event attendance is locked' using errcode = '55000'; end if;
    if not exists (select 1 from public.profiles p where p.id = p_actor and p.university_id = p_university_id) then
        raise exception 'Student number does not match your account' using errcode = '22023';
    end if;
    select * into a from public.event_attendance where event_id = e.id and student_id = p_actor for update;
    if not found then raise exception 'You are not a participant of this event' using errcode = '22023'; end if;

    v_now := clock_timestamp();
    if p_kind = 'time_in' then
        if a.time_in is not null then raise exception 'Time-in already recorded' using errcode = '23505'; end if;
        if not (v_now between e.time_in_from and e.time_in_until) then
            raise exception 'Outside the time-in window' using errcode = '22023'; end if;
    else
        if a.time_out is not null then raise exception 'Time-out already recorded' using errcode = '23505'; end if;
        if e.time_out_from is null or not (v_now between e.time_out_from and e.time_out_until) then
            raise exception 'Outside the time-out window' using errcode = '22023'; end if;
        if a.time_in is null and not exists (select 1 from public.event_attendance_claims c where c.event_id = e.id
            and c.student_id = p_actor and c.kind = 'time_in' and c.status = 'pending') then
            raise exception 'Time-in not recorded' using errcode = '22023';
        end if;
    end if;
    if exists (select 1 from public.event_attendance_claims c where c.event_id = e.id and c.student_id = p_actor
        and c.kind = p_kind and c.status in ('pending', 'verified')) then
        raise exception 'A claim for this side is already awaiting review' using errcode = '23505';
    end if;
    if not exists (select 1 from public.files f where f.id = p_file and f.purpose = 'attendance_selfie'
        and f.uploader_id = p_actor) then
        raise exception 'Invalid attendance photo' using errcode = '22023';
    end if;

    insert into public.event_attendance_claims(event_id, student_id, kind, file_id, submitted_at,
        consented_at, consent_version)
    values (e.id, p_actor, p_kind, p_file, v_now, v_now, p_consent_version) returning id into v_id;
    return public.f_cmd_finish(p_key, jsonb_build_object('claim_id', v_id, 'event_id', e.id,
        'kind', p_kind, 'submitted_at', v_now));
end $$;

-- FL-050. Verify records the submission time with method selfie. Reject records
-- nothing, notifies the student and also rejects a pending time-out with its time-in.
create function public.review_attendance_claim(p_key uuid, p_actor uuid, p_claim uuid,
    p_decision text, p_reason text) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare c public.event_attendance_claims%rowtype; v_result jsonb; v_event uuid; v_reason text;
begin
    perform public.f_cmd_council(p_actor, true);
    v_reason := nullif(btrim(p_reason), '');
    if p_claim is null or p_decision is null or p_decision not in ('verify', 'reject')
        or (p_decision = 'reject') <> (v_reason is not null) or length(v_reason) > 500 then
        raise exception 'Invalid claim review' using errcode = '22023';
    end if;
    v_result := public.f_cmd_begin(p_key, 'review_attendance_claim', p_actor, jsonb_build_object(
        'claim', p_claim, 'decision', p_decision, 'reason', v_reason));
    if v_result is not null then return v_result; end if;

    -- Request -> event -> claim, the same lock order as capture.
    select event_id into v_event from public.event_attendance_claims where id = p_claim;
    if not found then raise exception 'Claim not found' using errcode = '22023'; end if;
    perform 1 from public.events where id = v_event for update;
    select * into c from public.event_attendance_claims where id = p_claim for update;
    if c.status <> 'pending' then raise exception 'Claim was already reviewed' using errcode = '55000'; end if;
    if c.student_id = p_actor then raise exception 'You cannot review your own claim' using errcode = '42501'; end if;

    if p_decision = 'verify' then
        perform public.f_cmd_record_attendance(p_actor, c.event_id, c.student_id, c.kind, 'selfie', c.submitted_at);
        update public.event_attendance_claims set status = 'verified', reviewed_by = p_actor, reviewed_at = now()
            where id = c.id;
    else
        if exists (select 1 from public.events where id = c.event_id and attendance_locked_at is not null) then
            raise exception 'Event attendance is locked' using errcode = '55000';
        end if;
        update public.event_attendance_claims x set status = 'rejected', reviewed_by = p_actor, reviewed_at = now(),
            rejection_reason = case when x.id = c.id then v_reason else 'The time-in claim was rejected.' end
            where x.id = c.id or (c.kind = 'time_in' and x.event_id = c.event_id and x.student_id = c.student_id
                and x.kind = 'time_out' and x.status = 'pending');
        perform public.f_cmd_notice(c.student_id, 'attendance_claim_rejected');
    end if;
    return public.f_cmd_finish(p_key, jsonb_build_object('claim_id', c.id, 'event_id', c.event_id,
        'decision', p_decision));
end $$;

-- Photo cleanup. The app deletes each object, then marks it. Anything a failed
-- deletion leaves behind is retried by the next review, capture or generation.
create function public.florence_undeleted_claim_photos(p_event uuid)
returns table(claim_id uuid, storage_key text)
language sql stable security definer set search_path = pg_catalog as $$
    select c.id, f.storage_key from public.event_attendance_claims c join public.files f on f.id = c.file_id
    where c.event_id = p_event and c.status <> 'pending' and c.photo_deleted_at is null
$$;

create function public.mark_claim_photo_deleted(p_claim uuid) returns void
language sql security definer set search_path = pg_catalog as $$
    update public.event_attendance_claims set photo_deleted_at = now()
    where id = p_claim and status <> 'pending' and photo_deleted_at is null
$$;

-- Same as 20261113110000, plus attendance_selfie (students only, 1 MB).
create or replace function public.register_file(p_key uuid, p_actor uuid, p_purpose text, p_storage_key text,
    p_media_type text, p_byte_size bigint) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare v_result jsonb; v_id uuid; v_ext text; v_type text; v_max bigint;
begin
    select x.ext, x.type, x.max into v_ext, v_type, v_max from (values
        ('roster_import', 'csv', 'text/csv', 1048576::bigint),
        ('payment_proof', 'webp', 'image/webp', 4194304::bigint),
        ('payment_account_qr', 'png', 'image/png', 2097152::bigint),
        ('attendance_selfie', 'webp', 'image/webp', 1048576::bigint)) x(purpose, ext, type, max)
        where x.purpose = p_purpose;
    if v_ext is null then raise exception 'Unknown file purpose' using errcode = '22023'; end if;
    if p_key is null or p_storage_key is distinct from p_purpose || '/' || p_actor || '/' || p_key || '.' || v_ext
        or p_media_type is distinct from v_type or p_byte_size is null or p_byte_size <= 0 or p_byte_size > v_max then
        raise exception 'Invalid file metadata' using errcode = '22023';
    end if;

    if p_purpose = 'roster_import' then
        perform public.f_cmd_council(p_actor);
    elsif p_purpose = 'payment_account_qr' then
        perform public.f_cmd_council(p_actor, false, true);
    else
        perform public.f_cmd_actor(p_actor);
        if not exists (select 1 from public.enrollments where student_id = p_actor) then
            raise exception 'Only students can upload this file' using errcode = '42501';
        end if;
    end if;

    v_result := public.f_cmd_begin(p_key, 'register_file', p_actor, jsonb_build_object(
        'purpose', p_purpose, 'storage_key', p_storage_key, 'media_type', p_media_type, 'byte_size', p_byte_size));
    if v_result is not null then return v_result; end if;
    insert into public.files(uploader_id, purpose, storage_key, media_type, byte_size)
        values (p_actor, p_purpose, p_storage_key, p_media_type, p_byte_size) returning id into v_id;
    return public.f_cmd_finish(p_key, jsonb_build_object('file_id', v_id));
end $$;

-- Same as 20261113110000, plus attendance_selfie: the claimant or any Council
-- member (E/O/R), and only while the claim is pending. An unclaimed upload is
-- readable by its uploader only.
create or replace function public.file_download_key(p_actor uuid, p_file uuid)
returns table(storage_key text, media_type text, purpose text)
language sql stable security definer set search_path = pg_catalog as $$
    with actor as (
        select p.id,
            exists (select 1 from public.council_memberships m where m.profile_id = p.id and m.removed_at is null
                and m.access_role in ('executive', 'operations')) as council,
            exists (select 1 from public.council_memberships m where m.profile_id = p.id and m.removed_at is null
                and m.access_role = 'executive') as executive,
            exists (select 1 from public.council_memberships m where m.profile_id = p.id and m.removed_at is null) as capture,
            exists (select 1 from public.enrollments n where n.student_id = p.id) as student
        from public.profiles p
        where p.id = p_actor and p.account_status = 'active' and p.auth_user_id is not null
    )
    select f.storage_key, f.media_type, f.purpose
    from public.files f cross join actor a
    where f.id = p_file and case f.purpose
        when 'roster_import' then a.council
        when 'payment_proof' then f.uploader_id = a.id
            or (a.council and exists (select 1 from public.payments y where y.proof_file_id = f.id))
        when 'payment_account_qr' then a.executive
            or (a.student and exists (select 1 from public.payment_accounts c
                where c.qr_file_id = f.id and c.archived_at is null))
        when 'attendance_selfie' then
            case when exists (select 1 from public.event_attendance_claims c where c.file_id = f.id)
                then exists (select 1 from public.event_attendance_claims c where c.file_id = f.id
                    and c.status = 'pending' and (c.student_id = a.id or a.capture))
                else f.uploader_id = a.id end
        else false end
$$;

-- Same as 20261113070000, plus FL-018: generation waits for every claim to be reviewed.
create or replace function public.generate_event_consequences(
    p_key uuid, p_actor uuid, p_event uuid, p_bucket public.bucket)
returns jsonb language plpgsql security definer
set search_path = pg_catalog set TimeZone = 'UTC' as $$
declare e public.events%rowtype; r public.event_consequence_rules%rowtype;
    a public.event_attendance%rowtype; v_result jsonb; v_outcome text; v_days integer;
    v_amount numeric; v_group uuid; v_zone text;
begin
    perform public.f_cmd_council(p_actor);
    if p_key is null or p_event is null or p_bucket is null then
        raise exception 'Explicit request, event and office/rle bucket required' using errcode = '22023';
    end if;
    -- Same request -> event -> sorted balances protocol as 003. Never amend old
    -- payloads just to make them compare equal to a newly invented election.
    perform pg_advisory_xact_lock(hashtextextended('florence:request:' || p_key::text, 0));
    if exists (select 1 from f_cmd_private.requests q where q.request_key = p_key
        and q.command = 'generate_event_consequences' and not (q.payload ? 'bucket')) then
        raise exception 'Legacy bucketless generation receipt requires explicit reconciliation; retained unchanged'
            using errcode = '55000';
    end if;
    v_result := public.f_cmd_begin(p_key, 'generate_event_consequences', p_actor,
        jsonb_build_object('event', p_event, 'bucket', p_bucket));
    -- Even receipt replays lock/recheck the event and its established election.
    select * into e from public.events where id = p_event for update;
    if not found then raise exception 'Event not found' using errcode = '22023'; end if;
    if e.attendance_locked_at is not null and e.consequence_bucket is null then
        raise exception 'Finalized legacy event has unknown bucket; no regeneration or election without reconciliation'
            using errcode = '55000';
    end if;
    if e.consequence_bucket is not null and e.consequence_bucket is distinct from p_bucket then
        raise exception 'Chosen bucket conflicts with established event generation bucket' using errcode = '22023';
    end if;
    if v_result is not null then
        if e.attendance_locked_at is null or e.consequence_bucket is distinct from p_bucket then
            raise exception 'Receipt conflicts with event finalization; reconcile before replay' using errcode = '55000';
        end if;
        return v_result;
    end if;
    if e.attendance_locked_at is null then
        if e.archived_at is not null then
            raise exception 'Archived events cannot generate consequences' using errcode = '55000';
        end if;
        -- Unreviewed claims are not absences: Council backlog must not fine students.
        if exists (select 1 from public.event_attendance_claims c where c.event_id = e.id and c.status = 'pending') then
            raise exception 'Attendance claims are awaiting verification' using errcode = '55000';
        end if;
        -- A committed open election/partial ledger is not an invitation to
        -- complete or repair history by guessing what a previous writer meant.
        if e.consequence_bucket is not null or exists (
            select 1 from public.demerits d join public.event_attendance ea on ea.id = d.event_attendance_id where ea.event_id = e.id
        ) or exists (
            select 1 from public.obligations o join public.event_attendance ea on ea.id = o.event_attendance_id where ea.event_id = e.id
        ) then raise exception 'Open event has generation facts; reconcile before generation' using errcode = '55000'; end if;
        perform public.f_cmd_freeze_event(p_event);
        select * into e from public.events where id = p_event for update;
        select * into r from public.event_consequence_rules where event_id = e.id;
        if not found then raise exception 'Frozen event has no consequence rules'; end if;
        if clock_timestamp() < greatest(e.ends_at, e.time_in_until, e.time_out_until) then
            raise exception 'Event and capture windows must end before consequence generation'; end if;
        v_zone := public.f_cmd_timezone();
        -- Snapshot BEFORE unit INSERT triggers; finalization follows all units.
        update public.events set consequence_bucket = p_bucket where id = e.id;
        perform pg_advisory_xact_lock(k) from (select distinct public.f_cmd_balance_key(student_id, p_bucket) k
            from public.event_attendance where event_id = e.id) s order by k;
        for a in select * from public.event_attendance where event_id = e.id order by id loop
            v_outcome := public.f_cmd_event_outcome(a.time_in, a.time_out, e, r);
            if v_outcome is null then continue; end if;
            v_days := case v_outcome when 'absence' then r.absence_demerit_days else r.late_demerit_days end;
            v_amount := case v_outcome when 'absence' then r.absence_fine_amount else r.late_fine_amount end;
            if v_amount is not null then
                insert into public.obligations(student_id, semester_id, kind, event_attendance_id,
                    consequence_outcome, description, amount)
                values (a.student_id, e.semester_id, 'fine', a.id, v_outcome, e.name || ': ' || v_outcome, v_amount);
                perform public.f_cmd_notice(a.student_id, 'obligation_due');
            end if;
            if v_days > 0 then
                v_group := gen_random_uuid();
                insert into public.demerits(incident_group_id, incident_unit_index, student_id, semester_id,
                    bucket, source, description, incident_on, event_attendance_id, consequence_outcome, source_unit_index, issued_by)
                select v_group, n, a.student_id, e.semester_id, p_bucket, 'council', e.name || ': ' || v_outcome,
                    (e.starts_at at time zone v_zone)::date, a.id, v_outcome, n, p_actor from generate_series(1, v_days) n;
                perform public.f_cmd_notice(a.student_id, 'demerit_incurred');
            end if;
        end loop;
        update public.events set attendance_locked_at = now(), updated_at = now() where id = e.id
            returning attendance_locked_at into e.attendance_locked_at;
    end if;
    return public.f_cmd_finish(p_key, jsonb_build_object('event_id', e.id, 'bucket', p_bucket, 'locked_at', e.attendance_locked_at,
        'obligation_count', (select count(*) from public.obligations o join public.event_attendance ea on ea.id = o.event_attendance_id where ea.event_id = e.id),
        'demerit_count', (select count(*) from public.demerits d join public.event_attendance ea on ea.id = d.event_attendance_id where ea.event_id = e.id)));
end $$;

-- Private helpers: never granted.
revoke all on function f_access_private.claim_guard() from public, anon, authenticated, service_role;
revoke all on function f_access_private.supersede_claims() from public, anon, authenticated, service_role;
revoke all on function public.f_cmd_record_attendance(uuid, uuid, uuid, text, text, timestamptz)
    from public, anon, authenticated, service_role;
revoke all on function public.f_cmd_record_attendance(uuid, uuid, uuid, text, text)
    from public, anon, authenticated, service_role;
revoke all on function public.f_cmd_notice(uuid, text) from public, anon, authenticated, service_role;

-- Server commands: service role only. create or replace keeps existing ACLs; restated for clarity.
do $grants$
declare f text;
begin
    foreach f in array array[
        'public.submit_attendance_claim(uuid, uuid, uuid, text, text, uuid, text)',
        'public.review_attendance_claim(uuid, uuid, uuid, text, text)',
        'public.florence_undeleted_claim_photos(uuid)',
        'public.mark_claim_photo_deleted(uuid)',
        'public.register_file(uuid, uuid, text, text, text, bigint)',
        'public.file_download_key(uuid, uuid)',
        'public.generate_event_consequences(uuid, uuid, uuid, public.bucket)'] loop
        execute format('revoke all on function %s from public, anon, authenticated, service_role', f);
        execute format('grant execute on function %s to service_role', f);
    end loop;
end $grants$;

commit;
