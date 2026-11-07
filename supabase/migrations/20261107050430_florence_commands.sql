-- Florence V1 transactional command handoff. Fresh namespace after 001/002 ONLY.
-- Not applied; not an upgrade. This file owns no policies or integrity triggers.
-- SECURITY: server resolves p_actor from a verified Auth session, never a form.
-- Only service_role can execute entry points. The DB additionally checks that the
-- supplied human profile is active, Auth-linked and currently authorized. This
-- does NOT cryptographically bind that profile to a service-role request.
-- All RPCs return small JSON objects, never unrestricted Faculty/finance rows.
-- Errors roll back every write; retry SQLSTATE 40001/40P01 with the SAME key.
-- READ COMMITTED is required (fresh post-lock snapshots). No external money or
-- attendance fact can be independently verified by SQL.
--
-- Private technical request receipts retain exact JSON payload/result, including
-- zero-row outcomes, not a new business workflow/audit dashboard. Keys are global
-- across commands; keys/payloads must be retained, not expired or regenerated.
-- Payload equality is JSONB equality; array order is significant.
-- Lock order: request -> parent(event/session) -> sorted balance keys -> units;
-- finance request -> receipt -> payment -> sorted obligation UUIDs. Never acquire
-- a session while holding a balance. Merit application locks BOTH bucket keys
-- (sorted bigint order), serializing the common spendable merit pool as well.
-- Shared balance key: hashtextextended('florence:balance:'||student||':'||bucket,0).
-- Other writers/002 must use this exact protocol, including balance INCREASES.
-- Do not call multiple commands in arbitrary order in a larger transaction.
--
-- DEPLOYMENT BLOCKERS / integration contracts:
-- * Set owner-controlled f_cmd_private.settings singleton institutional_timezone
--   (IANA pg_timezone_names name) and council_event_bucket after policy approval.
--   No defaults are guessed. Date-sensitive commands fail closed until configured.
-- * 002 owns history/freeze triggers for direct owner writes. These RPCs do not
--   disable/bypass those triggers. Review trigger compatibility before adoption.
-- * Definition/configuration creation, roster/provisioning and semester activation
--   remain authorized server transactions, not generic JSON patch RPCs here.
-- * Transfer submission is deliberately not exposed until reference/proof
--   requirements are agreed. Existing pending submissions can be reviewed here.
-- * Feedback wording/window, file policy and notification read-state are outside
--   these commands. Notices here use fixed categories and no navigation targets.
-- * Runtime PostgreSQL, ACL, rollback and two-session concurrency tests REQUIRED;
--   pglast parsing alone does not validate PL/pgSQL name resolution or invariants.

begin;

create schema f_cmd_private;
revoke all on schema f_cmd_private from public, anon, authenticated, service_role;
create table f_cmd_private.settings (
    singleton boolean primary key default true check (singleton),
    institutional_timezone text not null check (btrim(institutional_timezone) <> ''),
    council_event_bucket public.bucket not null
);
create table f_cmd_private.requests (
    request_key uuid primary key,
    command text not null,
    actor_id uuid not null references public.profiles on delete restrict,
    payload jsonb not null,
    result jsonb,
    created_at timestamptz not null default now()
);
alter table f_cmd_private.settings enable row level security;
alter table f_cmd_private.requests enable row level security;
revoke all on all tables in schema f_cmd_private from public, anon, authenticated, service_role;

create function public.f_cmd_actor(p_actor uuid) returns void
language plpgsql security definer set search_path = pg_catalog as $$
begin
    if current_setting('transaction_isolation') <> 'read committed' then
        raise exception 'Commands require READ COMMITTED isolation' using errcode = '25000';
    end if;
    perform 1 from public.profiles where id = p_actor and account_status = 'active'
        and auth_user_id is not null for share;
    if not found then raise exception 'Active Auth-linked human actor required' using errcode = '42501'; end if;
end $$;

create function public.f_cmd_role(p_actor uuid, p_role text) returns boolean
language plpgsql security definer set search_path = pg_catalog as $$
begin
    perform 1 from public.role_assignments
        where profile_id = p_actor and role = p_role and removed_at is null for share;
    return found;
end $$;

create function public.f_cmd_council(p_actor uuid, p_capture boolean default false,
    p_executive boolean default false) returns void
language plpgsql security definer set search_path = pg_catalog as $$
begin
    perform public.f_cmd_actor(p_actor);
    perform 1 from public.council_memberships where profile_id = p_actor
        and removed_at is null and (access_role = 'executive'
        or (not p_executive and (access_role = 'operations' or p_capture))) for share;
    if not found then raise exception 'Council action not authorized' using errcode = '42501'; end if;
end $$;

create function public.f_cmd_instructor(p_actor uuid, p_bucket public.bucket default null)
returns void language plpgsql security definer set search_path = pg_catalog as $$
begin
    perform public.f_cmd_actor(p_actor);
    perform 1 from public.role_assignments where profile_id = p_actor and removed_at is null
        and ((role = 'Academic Instructor' and (p_bucket is null or p_bucket = 'office'))
          or (role = 'Clinical Instructor' and (p_bucket is null or p_bucket = 'rle'))) for share;
    if not found then raise exception 'Matching instructor assignment required' using errcode = '42501'; end if;
end $$;

create function public.f_cmd_student(p_student uuid, p_semester uuid) returns void
language plpgsql security definer set search_path = pg_catalog as $$
begin
    -- A roster identity need not yet have an Auth account. Historical debts remain
    -- collectible for archived students; actor access is checked separately.
    if p_student is null or p_semester is null or not exists (
        select 1 from public.enrollments where student_id = p_student and semester_id = p_semester
    ) then raise exception 'Student enrollment in the specified semester required' using errcode = '22023'; end if;
end $$;

create function public.f_cmd_timezone() returns text
language plpgsql stable security definer set search_path = pg_catalog as $$
declare v_zone text;
begin
    select s.institutional_timezone into v_zone from f_cmd_private.settings s
        join pg_catalog.pg_timezone_names z on z.name = s.institutional_timezone;
    if v_zone is null then raise exception 'Configure approved institutional timezone in f_cmd_private.settings' using errcode = '55000'; end if;
    return v_zone;
end $$;

create function public.f_cmd_current_semester() returns uuid
language plpgsql security definer set search_path = pg_catalog as $$
declare v_id uuid;
begin
    -- Semester activation must take the same advisory key exclusively.
    perform pg_advisory_xact_lock_shared(hashtextextended('florence:semester-context', 0));
    select id into v_id from public.semesters where is_current;
    if v_id is null then raise exception 'Activate a semester before creating academic records' using errcode = '55000'; end if;
    return v_id;
end $$;

create function public.f_cmd_begin(p_key uuid, p_command text, p_actor uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_row f_cmd_private.requests%rowtype;
begin
    if p_key is null or p_payload is null then raise exception 'Non-null request key/payload required' using errcode = '22023'; end if;
    perform public.f_cmd_actor(p_actor);
    perform pg_advisory_xact_lock(hashtextextended('florence:request:' || p_key::text, 0));
    select * into v_row from f_cmd_private.requests where request_key = p_key;
    if found then
        if v_row.command <> p_command or v_row.actor_id <> p_actor or v_row.payload <> p_payload then
            raise exception 'Request key reused with different command, actor or input' using errcode = '22023';
        end if;
        if v_row.result is null then raise exception 'Incomplete command receipt; inspect transaction integration' using errcode = '55000'; end if;
        return v_row.result;
    end if;
    insert into f_cmd_private.requests(request_key, command, actor_id, payload)
        values (p_key, p_command, p_actor, p_payload);
    return null;
end $$;

create function public.f_cmd_finish(p_key uuid, p_result jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
begin
    if p_result is null then raise exception 'Command result cannot be null'; end if;
    update f_cmd_private.requests set result = p_result where request_key = p_key and result is null;
    if not found then raise exception 'Missing pending command receipt'; end if;
    return p_result;
end $$;

create function public.f_cmd_balance_key(p_student uuid, p_bucket public.bucket) returns bigint
language sql immutable strict set search_path = pg_catalog as $$
    select hashtextextended('florence:balance:' || p_student::text || ':' || p_bucket::text, 0)
$$;

create function public.f_cmd_balance(p_student uuid, p_bucket public.bucket) returns bigint
language sql volatile security definer set search_path = pg_catalog as $$
    select (select count(*) from public.demerits where student_id = p_student and bucket = p_bucket and waived_at is null)
         - (select count(*) from public.merit_applications where student_id = p_student and bucket = p_bucket)
         - (select count(*) from public.service_credits where student_id = p_student and bucket = p_bucket and revoked_at is null)
$$;

create function public.f_cmd_notice(p_student uuid, p_kind text) returns void
language plpgsql security definer set search_path = pg_catalog as $$
declare v_message text;
begin
    v_message := case p_kind
        when 'merit_received' then 'A merit award was recorded. View your records.'
        when 'demerit_incurred' then 'A demerit was recorded. View your records.'
        when 'service_recorded' then 'Service completion was recorded. View your records.'
        when 'obligation_due' then 'An obligation was recorded. View your account.'
        when 'payment_verified' then 'Your payment was verified. View your account.'
        when 'payment_rejected' then 'Your payment submission was rejected. View your account.'
        else null end;
    if v_message is null then raise exception 'Unsupported command notification kind'; end if;
    insert into public.notifications(recipient_id, kind, message) values (p_student, p_kind, v_message);
end $$;

-- RPC freeze_event: key, actor, event -> {event_id, participant_count}.
-- RPC prepare_event_capture(event, actor) -> {event_id}: capture-level Council
-- authorization, including Representatives; call before the restricted attendance
-- lookup resolves a university-number QR/manual search to a participant UUID.
-- Preparation exposes no roster, consequence rules or event-management authority.
-- Parent-locked freezing is intrinsically idempotent; no request key is needed.
-- Capture must still lock/recheck state: preparation is not a capture reservation.
-- First capture may also call the private freeze helper directly.
create function public.f_cmd_freeze_event(p_event uuid) returns void
language plpgsql security definer set search_path = pg_catalog as $$
declare e public.events%rowtype; r public.event_consequence_rules%rowtype; v_amount numeric;
begin
    select * into e from public.events where id = p_event for update;
    if not found then raise exception 'Event not found' using errcode = '22023'; end if;
    if e.audience_frozen_at is not null then return; end if;
    select * into r from public.event_consequence_rules where event_id = p_event for update;
    if not found or e.time_in_from is null or (r.requires_time_out and e.time_out_from is null)
        or not isfinite(e.starts_at) or not isfinite(e.ends_at)
        or not isfinite(e.time_in_from) or not isfinite(e.time_in_until)
        or (e.time_out_from is not null and (not isfinite(e.time_out_from) or not isfinite(e.time_out_until))) then
        raise exception 'Complete event rules and required attendance windows before publication' using errcode = '22023';
    end if;
    -- Lock definitions in UUID order to coordinate with definition editors.
    perform 1 from public.fine_definitions where id in (r.absence_fine_definition_id, r.late_fine_definition_id)
        order by id for share;
    if r.absence_fine_definition_id is not null then
        select amount into v_amount from public.fine_definitions where id = r.absence_fine_definition_id and archived_at is null;
        if not found then raise exception 'Absence fine is unavailable'; end if;
        r.absence_fine_amount := v_amount;
    end if;
    if r.late_fine_definition_id is not null then
        select amount into v_amount from public.fine_definitions where id = r.late_fine_definition_id and archived_at is null;
        if not found then raise exception 'Late fine is unavailable'; end if;
        r.late_fine_amount := v_amount;
    end if;
    update public.event_consequence_rules set absence_fine_amount = r.absence_fine_amount,
        late_fine_amount = r.late_fine_amount where id = r.id;
    if exists (select 1 from public.event_attendance where event_id = p_event) then
        raise exception 'Unfrozen event already has participant rows; reconcile before publication' using errcode = '55000';
    end if;
    -- One statement snapshot: year OR, status OR, groups AND. No later resync.
    insert into public.event_attendance(event_id, student_id, semester_id,
        year_level_snapshot, academic_status_snapshot, updated_at)
    select e.id, n.student_id, e.semester_id, n.year_level, n.academic_status, now()
        from public.enrollments n where n.semester_id = e.semester_id
        and n.year_level = any(e.year_levels) and n.academic_status::text = any(e.academic_statuses);
    update public.events set audience_frozen_at = now(), updated_at = now() where id = e.id;
end $$;

create function public.freeze_event(p_key uuid, p_actor uuid, p_event uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare v_result jsonb;
begin
    perform public.f_cmd_council(p_actor);
    v_result := public.f_cmd_begin(p_key, 'freeze_event', p_actor, jsonb_build_object('event', p_event));
    if v_result is not null then return v_result; end if;
    perform public.f_cmd_freeze_event(p_event);
    return public.f_cmd_finish(p_key, jsonb_build_object('event_id', p_event, 'participant_count',
        (select count(*) from public.event_attendance where event_id = p_event)));
end $$;

create function public.prepare_event_capture(p_event uuid, p_actor uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
begin
    perform public.f_cmd_council(p_actor, true);
    -- The helper acquires the event FOR UPDATE lock even when already frozen.
    perform public.f_cmd_freeze_event(p_event);
    if exists (select 1 from public.events where id = p_event and attendance_locked_at is not null) then
        raise exception 'Event attendance is locked' using errcode = '55000';
    end if;
    return jsonb_build_object('event_id', p_event);
end $$;

-- RPC capture_event_attendance: rows is a nonempty <=10000 JSON array of exact
-- {student_id:uuid, time_in:timestamptz|null, time_out:timestamptz|null} objects.
-- Each row is a full replacement (corrections included), not a timestamp patch.
-- method = qr/manual/csv; actual times <= server clock, inclusive windows.
-- Result {event_id, updated_count}; any invalid row rolls back the entire batch.
create function public.capture_event_attendance(p_key uuid, p_actor uuid, p_event uuid,
    p_method text, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare e public.events%rowtype; x record; v_result jsonb; v_count integer := 0;
begin
    perform public.f_cmd_council(p_actor, true);
    if p_method is null or p_method not in ('qr','manual','csv') or jsonb_typeof(p_rows) is distinct from 'array'
        or jsonb_array_length(p_rows) not between 1 and 10000 then raise exception 'Invalid attendance batch' using errcode = '22023'; end if;
    v_result := public.f_cmd_begin(p_key, 'capture_event_attendance', p_actor,
        jsonb_build_object('event', p_event, 'method', p_method, 'rows', p_rows));
    if v_result is not null then return v_result; end if;
    perform public.f_cmd_freeze_event(p_event);
    select * into e from public.events where id = p_event for update;
    if e.attendance_locked_at is not null then raise exception 'Event attendance is locked' using errcode = '55000'; end if;
    if exists (select 1 from jsonb_array_elements(p_rows) a(v) where jsonb_typeof(v) <> 'object'
        or v - array['student_id','time_in','time_out']::text[] <> '{}'::jsonb
        or not (v ?& array['student_id','time_in','time_out'])) then raise exception 'Invalid attendance row shape'; end if;
    if (select count(distinct (v->>'student_id')::uuid) from jsonb_array_elements(p_rows) a(v)) <> jsonb_array_length(p_rows) then
        raise exception 'Missing or duplicate participant in batch'; end if;
    for x in select * from jsonb_to_recordset(p_rows) as t(student_id uuid, time_in timestamptz, time_out timestamptz) loop
        if x.student_id = p_actor then raise exception 'Self attendance recording is forbidden' using errcode = '42501'; end if;
        if (x.time_in is not null and (not (x.time_in between e.time_in_from and e.time_in_until) or x.time_in > clock_timestamp()))
            or (x.time_out is not null and (e.time_out_from is null or not (x.time_out between e.time_out_from and e.time_out_until)
                or x.time_in is null or x.time_out <= x.time_in or x.time_out > clock_timestamp())) then raise exception 'Attendance outside valid windows'; end if;
        update public.event_attendance set time_in = x.time_in, time_out = x.time_out,
            time_in_method = case when x.time_in is not null then p_method end,
            time_out_method = case when x.time_out is not null then p_method end,
            time_in_recorded_by = case when x.time_in is not null then p_actor end,
            time_out_recorded_by = case when x.time_out is not null then p_actor end, updated_at = now()
            where event_id = e.id and student_id = x.student_id;
        if not found then raise exception 'Student is not in preserved event audience'; end if;
        v_count := v_count + 1;
    end loop;
    return public.f_cmd_finish(p_key, jsonb_build_object('event_id', e.id, 'updated_count', v_count));
end $$;

-- RPC generate_event_consequences: key/actor/event -> {event_id, locked_at,
-- obligation_count, demerit_count}. Parent identity also provides once-only
-- finalization across DIFFERENT request keys. Absence strictly precedes late.
create function public.generate_event_consequences(p_key uuid, p_actor uuid, p_event uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare e public.events%rowtype; r public.event_consequence_rules%rowtype;
    a public.event_attendance%rowtype; v_result jsonb; v_outcome text; v_days integer;
    v_amount numeric; v_group uuid; v_bucket public.bucket; v_zone text;
begin
    perform public.f_cmd_council(p_actor);
    v_result := public.f_cmd_begin(p_key, 'generate_event_consequences', p_actor, jsonb_build_object('event', p_event));
    if v_result is not null then return v_result; end if;
    perform public.f_cmd_freeze_event(p_event);
    select * into e from public.events where id = p_event for update;
    if e.attendance_locked_at is null then
        select * into r from public.event_consequence_rules where event_id = e.id;
        if not found then raise exception 'Frozen event has no consequence rules'; end if;
        if clock_timestamp() < greatest(e.ends_at, e.time_in_until, e.time_out_until) then
            raise exception 'Event and capture windows must end before consequence generation'; end if;
        v_zone := public.f_cmd_timezone();
        select council_event_bucket into v_bucket from f_cmd_private.settings;
        if v_bucket is null then raise exception 'Approved Council event bucket is not configured' using errcode = '55000'; end if;
        -- Balance increases also serialize with spending. Acquire all keys first.
        perform pg_advisory_xact_lock(k) from (select distinct public.f_cmd_balance_key(student_id, v_bucket) k
            from public.event_attendance where event_id = e.id) s order by k;
        for a in select * from public.event_attendance where event_id = e.id order by id loop
            v_outcome := case when a.time_in is null or not (a.time_in between e.time_in_from and e.time_in_until)
                or (r.requires_time_out and (a.time_out is null or not (a.time_out between e.time_out_from and e.time_out_until))) then 'absence'
                when a.time_in > e.time_in_from + make_interval(mins => e.late_after_minutes) then 'late' else null end;
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
                select v_group, n, a.student_id, e.semester_id, v_bucket, 'council', e.name || ': ' || v_outcome,
                    (e.starts_at at time zone v_zone)::date, a.id, v_outcome, n, p_actor from generate_series(1, v_days) n;
                perform public.f_cmd_notice(a.student_id, 'demerit_incurred');
            end if;
        end loop;
        update public.events set attendance_locked_at = now(), updated_at = now() where id = e.id
            returning attendance_locked_at into e.attendance_locked_at;
    end if;
    return public.f_cmd_finish(p_key, jsonb_build_object('event_id', e.id, 'locked_at', e.attendance_locked_at,
        'obligation_count', (select count(*) from public.obligations o join public.event_attendance ea on ea.id = o.event_attendance_id where ea.event_id = e.id),
        'demerit_count', (select count(*) from public.demerits d join public.event_attendance ea on ea.id = d.event_attendance_id where ea.event_id = e.id)));
end $$;

-- Finance helpers are private, not service-role entry points. All effective
-- settlement queries use current authoritative verified/unrefunded records.
create function public.f_cmd_settled(p_obligation uuid, p_except uuid default null) returns boolean
language sql volatile security definer set search_path = pg_catalog as $$
    select exists (select 1 from public.payment_items i join public.payments p on p.id = i.payment_id
        where i.obligation_id = p_obligation and p.id is distinct from p_except
        and p.record_status = 'current' and p.status = 'verified' and p.is_receipt_record
        and not exists (select 1 from public.payment_refunds r where r.receipt_id = p.receipt_id))
$$;

create function public.f_cmd_lock_obligations(p_ids uuid[]) returns void
language plpgsql security definer set search_path = pg_catalog as $$
begin
    if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 10000
        or array_ndims(p_ids) <> 1 or array_position(p_ids, null) is not null
        or (select count(distinct v) from unnest(p_ids) v) <> cardinality(p_ids) then
        raise exception 'A nonempty unique obligation UUID array (maximum 10000) is required' using errcode = '22023';
    end if;
    perform 1 from public.obligations where id = any(p_ids) order by id for update;
    if (select count(*) from public.obligations where id = any(p_ids)) <> cardinality(p_ids) then
        raise exception 'Unknown obligation' using errcode = '22023'; end if;
end $$;

create function public.f_cmd_item_total(p_ids uuid[], p_student uuid, p_semester uuid,
    p_payable boolean, p_except uuid default null) returns numeric
language plpgsql security definer set search_path = pg_catalog as $$
declare v_total numeric;
begin
    if p_student is null or p_semester is null or exists (select 1 from public.obligations
        where id = any(p_ids) and (student_id <> p_student or semester_id <> p_semester)) then
        raise exception 'Payment items must share beneficiary and semester'; end if;
    if p_payable and exists (select 1 from public.obligations where id = any(p_ids)
        and (waived_at is not null or public.f_cmd_settled(id, p_except))) then
        raise exception 'Selected obligation is waived or already settled' using errcode = '23514'; end if;
    select sum(amount) into v_total from public.obligations where id = any(p_ids);
    if v_total is null or v_total <= 0 or v_total >= 10000000000 then raise exception 'Invalid payment total'; end if;
    return v_total;
end $$;

create function public.f_cmd_check_items(p_payment uuid, p_payable boolean) returns uuid[]
language plpgsql security definer set search_path = pg_catalog as $$
declare p public.payments%rowtype; v_ids uuid[]; v_total numeric;
begin
    select * into p from public.payments where id = p_payment;
    if not found then raise exception 'Payment not found'; end if;
    select array_agg(obligation_id order by obligation_id) into v_ids from public.payment_items where payment_id = p.id;
    perform public.f_cmd_lock_obligations(v_ids);
    v_total := public.f_cmd_item_total(v_ids, p.student_id, p.semester_id, p_payable, p.id);
    if v_total <> p.amount or exists (select 1 from public.payment_items i join public.obligations o on o.id = i.obligation_id
        where i.payment_id = p.id and i.amount <> o.amount) then raise exception 'Payment must equal full selected items'; end if;
    return v_ids;
end $$;

-- record_cash_payment: actual externally confirmed received_at, complete items;
-- result {payment_id, receipt_id, amount}. No client-supplied total/status.
create function public.record_cash_payment(p_key uuid, p_actor uuid, p_student uuid,
    p_semester uuid, p_obligations uuid[], p_received_at timestamptz) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare v_result jsonb; v_payment uuid; v_receipt uuid; v_total numeric;
begin
    perform public.f_cmd_council(p_actor);
    if p_student = p_actor then raise exception 'Self cash recording forbidden' using errcode = '42501'; end if;
    if p_received_at is null or not isfinite(p_received_at) or p_received_at > clock_timestamp() then raise exception 'Actual receipt time required'; end if;
    v_result := public.f_cmd_begin(p_key, 'record_cash_payment', p_actor, jsonb_build_object(
        'student', p_student, 'semester', p_semester, 'obligations', p_obligations, 'received_at', p_received_at));
    if v_result is not null then return v_result; end if;
    perform public.f_cmd_student(p_student, p_semester);
    -- New receipt cannot be concurrently referenced before this commit.
    insert into public.payment_receipts(request_key, received_at, recognized_by)
        values (p_key, p_received_at, p_actor) returning id into v_receipt;
    perform public.f_cmd_lock_obligations(p_obligations);
    v_total := public.f_cmd_item_total(p_obligations, p_student, p_semester, true);
    insert into public.payments(student_id, semester_id, method, status, record_status,
        request_key, receipt_id, is_receipt_record, amount, submitted_by, submitted_at, decided_by, decided_at)
    values (p_student, p_semester, 'cash', 'verified', 'current', p_key, v_receipt, true,
        v_total, p_actor, now(), p_actor, now()) returning id into v_payment;
    insert into public.payment_items(payment_id, obligation_id, student_id, semester_id, amount)
        select v_payment, id, student_id, semester_id, amount from public.obligations where id = any(p_obligations);
    perform public.f_cmd_notice(p_student, 'payment_verified');
    return public.f_cmd_finish(p_key, jsonb_build_object('payment_id', v_payment, 'receipt_id', v_receipt, 'amount', v_total));
end $$;

-- verify_payment mode contracts:
-- received: verify NEW actual receipt; received_at required; other money args null.
-- no_receipt: reject without new receipt; reason required; money args null.
-- duplicate: reject duplicate evidence; existing_receipt required; all times null.
-- returned: reject NEW actual transfer received and fully returned externally;
-- received_at/refunded_at/reason required, existing_receipt null.
-- All modes require p_facts_confirmed = true: operator attestation, NOT bank proof.
-- result {payment_id, status, receipt_id}; duplicate links are non-authoritative.
create function public.verify_payment(p_key uuid, p_actor uuid, p_payment uuid,
    p_mode text, p_reason text, p_received_at timestamptz, p_existing_receipt uuid,
    p_refunded_at timestamptz, p_facts_confirmed boolean) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare p public.payments%rowtype; v_result jsonb; v_receipt uuid; v_ids uuid[]; v_owner uuid;
begin
    perform public.f_cmd_council(p_actor);
    if p_mode is null or p_mode not in ('received','no_receipt','duplicate','returned')
        or p_facts_confirmed is distinct from true then raise exception 'Receipt/return facts must be confirmed'; end if;
    if p_mode <> 'received' and nullif(btrim(p_reason), '') is null then raise exception 'Rejection reason required'; end if;
    if (p_mode in ('received','returned')) <> (p_received_at is not null)
        or (p_mode = 'duplicate') <> (p_existing_receipt is not null)
        or (p_mode = 'returned') <> (p_refunded_at is not null)
        or (p_received_at is not null and (not isfinite(p_received_at) or p_received_at > clock_timestamp()))
        or (p_refunded_at is not null and (not isfinite(p_refunded_at) or p_refunded_at < p_received_at or p_refunded_at > clock_timestamp())) then
        raise exception 'Money evidence does not match decision mode'; end if;
    v_result := public.f_cmd_begin(p_key, 'verify_payment', p_actor, jsonb_build_object('payment', p_payment,
        'mode', p_mode, 'reason', p_reason, 'received_at', p_received_at, 'existing_receipt', p_existing_receipt,
        'refunded_at', p_refunded_at, 'confirmed', p_facts_confirmed));
    if v_result is not null then return v_result; end if;
    if p_existing_receipt is not null then
        perform 1 from public.payment_receipts where id = p_existing_receipt for update;
        if not found then raise exception 'Existing receipt not found'; end if;
        select student_id into v_owner from public.payments where receipt_id = p_existing_receipt
            and is_receipt_record and record_status = 'current';
        if not found or v_owner = p_actor then raise exception 'Receipt has no authorized authoritative representation' using errcode = '42501'; end if;
        v_receipt := p_existing_receipt;
    elsif p_mode in ('received','returned') then
        insert into public.payment_receipts(request_key, received_at, recognized_by)
            values (p_key, p_received_at, p_actor) returning id into v_receipt;
    end if;
    select * into p from public.payments where id = p_payment for update;
    if not found or p.method <> 'transfer' or p.status <> 'pending' or p.record_status <> 'current' then
        raise exception 'Only a current pending transfer can be decided' using errcode = '55000'; end if;
    if p.student_id = p_actor then raise exception 'Self payment decision forbidden' using errcode = '42501'; end if;
    -- Cross-beneficiary duplicate linking is not needed to count one transfer and
    -- would expose another student's receipt context; handle discrepancies outside.
    if p_mode = 'duplicate' and v_owner <> p.student_id then raise exception 'Duplicate receipt beneficiary mismatch'; end if;
    v_ids := public.f_cmd_check_items(p.id, p_mode = 'received');
    update public.payments set status = case p_mode when 'received' then 'verified' else 'rejected' end,
        receipt_id = v_receipt, is_receipt_record = p_mode in ('received','returned'),
        decided_by = p_actor, decided_at = now(), decision_reason = p_reason where id = p.id;
    if p_mode = 'returned' then
        insert into public.payment_refunds(receipt_id, payment_id, amount, reason, recorded_by, refunded_at)
            values (v_receipt, p.id, p.amount, p_reason, p_actor, p_refunded_at);
    end if;
    perform public.f_cmd_notice(p.student_id, case p_mode when 'received' then 'payment_verified' else 'payment_rejected' end);
    return public.f_cmd_finish(p_key, jsonb_build_object('payment_id', p.id,
        'status', case p_mode when 'received' then 'verified' else 'rejected' end, 'receipt_id', v_receipt));
end $$;

-- record_refund: receipt identity, actual full external return and nonblank reason;
-- result {refund_id, receipt_id, amount}. Never rewrites status or waives debt.
create function public.record_refund(p_key uuid, p_actor uuid, p_receipt uuid,
    p_refunded_at timestamptz, p_reason text, p_facts_confirmed boolean) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare p public.payments%rowtype; v_result jsonb; v_refund uuid; v_received timestamptz; v_ids uuid[];
begin
    perform public.f_cmd_council(p_actor);
    if p_facts_confirmed is distinct from true or nullif(btrim(p_reason), '') is null
        or p_refunded_at is null or not isfinite(p_refunded_at) or p_refunded_at > clock_timestamp() then raise exception 'Actual completed refund time/reason/confirmation required'; end if;
    v_result := public.f_cmd_begin(p_key, 'record_refund', p_actor, jsonb_build_object('receipt', p_receipt,
        'refunded_at', p_refunded_at, 'reason', p_reason, 'confirmed', p_facts_confirmed));
    if v_result is not null then return v_result; end if;
    select received_at into v_received from public.payment_receipts where id = p_receipt for update;
    if not found or p_refunded_at < v_received then raise exception 'Invalid receipt/refund chronology'; end if;
    select * into p from public.payments where receipt_id = p_receipt and is_receipt_record and record_status = 'current' for update;
    if not found or p.student_id = p_actor then raise exception 'Refund not authorized' using errcode = '42501'; end if;
    v_ids := public.f_cmd_check_items(p.id, false);
    if exists (select 1 from public.payment_refunds where receipt_id = p_receipt) then raise exception 'Receipt already refunded'; end if;
    insert into public.payment_refunds(receipt_id, payment_id, amount, reason, recorded_by, refunded_at)
        values (p_receipt, p.id, p.amount, p_reason, p_actor, p_refunded_at) returning id into v_refund;
    return public.f_cmd_finish(p_key, jsonb_build_object('refund_id', v_refund, 'receipt_id', p_receipt, 'amount', p.amount));
end $$;

-- waive_obligation: key/actor/obligation/reason -> {obligation_id, waived_at}.
create function public.waive_obligation(p_key uuid, p_actor uuid, p_obligation uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare o public.obligations%rowtype; v_result jsonb;
begin
    perform public.f_cmd_council(p_actor);
    if nullif(btrim(p_reason), '') is null then raise exception 'Waiver reason required'; end if;
    v_result := public.f_cmd_begin(p_key, 'waive_obligation', p_actor, jsonb_build_object('obligation', p_obligation, 'reason', p_reason));
    if v_result is not null then return v_result; end if;
    perform public.f_cmd_lock_obligations(array[p_obligation]);
    select * into o from public.obligations where id = p_obligation;
    if o.student_id = p_actor then raise exception 'Self debt waiver forbidden' using errcode = '42501'; end if;
    if o.waived_at is not null or public.f_cmd_settled(o.id) then raise exception 'Only unpaid, unwaived obligations may be waived'; end if;
    update public.obligations set waived_at = now(), waived_by = p_actor, waiver_reason = p_reason where id = o.id;
    return public.f_cmd_finish(p_key, jsonb_build_object('obligation_id', o.id, 'waived_at', now()));
end $$;

-- correct_payment replaces full item selection only, preserving beneficiary,
-- semester, method, evidence, decision status, receipt/refund identity. Amount is
-- derived from complete new items; reason mandatory. No money movement. Changing
-- evidence/beneficiary/method or a rejected duplicate is not this correction path.
-- result {payment_id, supersedes_payment_id, receipt_id, amount}.
create function public.correct_payment(p_key uuid, p_actor uuid, p_payment uuid,
    p_obligations uuid[], p_reason text) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare p public.payments%rowtype; v_result jsonb; v_receipt uuid; v_ids uuid[];
    v_total numeric; v_refund numeric; v_new uuid;
begin
    perform public.f_cmd_council(p_actor);
    if nullif(btrim(p_reason), '') is null then raise exception 'Correction reason required'; end if;
    v_result := public.f_cmd_begin(p_key, 'correct_payment', p_actor,
        jsonb_build_object('payment', p_payment, 'obligations', p_obligations, 'reason', p_reason));
    if v_result is not null then return v_result; end if;
    select receipt_id into v_receipt from public.payments where id = p_payment;
    if v_receipt is null then raise exception 'Correction requires a recognized received payment'; end if;
    perform 1 from public.payment_receipts where id = v_receipt for update;
    select * into p from public.payments where id = p_payment for update;
    if not found or p.receipt_id is distinct from v_receipt or p.record_status <> 'current' or not p.is_receipt_record then
        raise exception 'Correction target must be the current authoritative receipt representation'; end if;
    if p.student_id = p_actor then raise exception 'Self payment correction forbidden' using errcode = '42501'; end if;
    -- Validate new array separately before forming the deduplicated old/new union.
    if p_obligations is null or cardinality(p_obligations) = 0 or cardinality(p_obligations) > 10000
        or array_ndims(p_obligations) <> 1 or array_position(p_obligations, null) is not null
        or (select count(distinct x) from unnest(p_obligations) x) <> cardinality(p_obligations) then raise exception 'Invalid replacement item selection'; end if;
    select array_agg(distinct id order by id) into v_ids from (
        select unnest(p_obligations) id union select obligation_id from public.payment_items where payment_id = p.id) s;
    perform public.f_cmd_lock_obligations(v_ids);
    select amount into v_refund from public.payment_refunds where receipt_id = p.receipt_id;
    v_total := public.f_cmd_item_total(p_obligations, p.student_id, p.semester_id,
        p.status = 'verified' and v_refund is null, p.id);
    if v_refund is not null and v_total <> v_refund then raise exception 'Correction would invalidate full refund history'; end if;
    if p.status = 'rejected' and v_refund is null then raise exception 'Received rejected payment must have a completed full return'; end if;
    -- Supersede then insert within this transaction, avoiding partial unique index
    -- conflict. 002 integrity checks must permit this valid atomic transition.
    update public.payments set record_status = 'superseded' where id = p.id;
    insert into public.payments(student_id, semester_id, method, status, record_status, request_key,
        receipt_id, is_receipt_record, payment_account_id, destination_label, destination_account_name,
        destination_account_reference, reference_number, proof_file_id, amount, submitted_by, submitted_at,
        decided_by, decided_at, decision_reason, supersedes_payment_id)
    values (p.student_id, p.semester_id, p.method, p.status, 'current', p_key, p.receipt_id, true,
        p.payment_account_id, p.destination_label, p.destination_account_name, p.destination_account_reference,
        p.reference_number, p.proof_file_id, v_total, p_actor, now(), p_actor, now(), p_reason, p.id) returning id into v_new;
    insert into public.payment_items(payment_id, obligation_id, student_id, semester_id, amount)
        select v_new, id, student_id, semester_id, amount from public.obligations where id = any(p_obligations);
    return public.f_cmd_finish(p_key, jsonb_build_object('payment_id', v_new, 'supersedes_payment_id', p.id,
        'receipt_id', p.receipt_id, 'amount', v_total));
end $$;
-- award_merits: positive whole days, description, actual award date. Ordinary
-- academic entry uses CURRENT semester and a date inside that semester (no general
-- historical backdating). external_source nonnull selects RLE Coordinator route.
-- result {request_key, unit_count}; all units inserted or none.
create function public.award_merits(p_key uuid, p_actor uuid, p_student uuid,
    p_days integer, p_description text, p_awarded_on date, p_external_source text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_result jsonb; v_semester uuid; v_today date;
begin
    perform public.f_cmd_instructor(p_actor);
    if p_external_source is not null and (not public.f_cmd_role(p_actor, 'RLE Coordinator')
        or not public.f_cmd_role(p_actor, 'Clinical Instructor') or nullif(btrim(p_external_source), '') is null) then
        raise exception 'External CI award requires entering RLE Coordinator and attribution' using errcode = '42501'; end if;
    if p_student = p_actor then raise exception 'Self award forbidden' using errcode = '42501'; end if;
    if p_days is null or p_days <= 0 or nullif(btrim(p_description), '') is null or p_awarded_on is null or not isfinite(p_awarded_on) then raise exception 'Positive days, description and award date required'; end if;
    v_result := public.f_cmd_begin(p_key, 'award_merits', p_actor, jsonb_build_object('student', p_student,
        'days', p_days, 'description', p_description, 'awarded_on', p_awarded_on, 'external_source', p_external_source));
    if v_result is not null then return v_result; end if;
    v_semester := public.f_cmd_current_semester();
    perform public.f_cmd_student(p_student, v_semester);
    v_today := (clock_timestamp() at time zone public.f_cmd_timezone())::date;
    if p_awarded_on > v_today or not exists (select 1 from public.semesters where id = v_semester
        and p_awarded_on between starts_on and ends_on) then raise exception 'Award date must be in current academic context and not future'; end if;
    insert into public.merits(student_id, semester_id, source, award_request_key, award_unit_index,
        description, awarded_on, expires_on, awarded_by, external_source_name)
    select p_student, v_semester, case when p_external_source is null then 'direct' else 'external_ci' end,
        p_key, n, p_description, p_awarded_on, (p_awarded_on + interval '1 year')::date,
        p_actor, p_external_source from generate_series(1, p_days) n;
    perform public.f_cmd_notice(p_student, 'merit_received');
    return public.f_cmd_finish(p_key, jsonb_build_object('request_key', p_key, 'unit_count', p_days));
end $$;

-- endorse_merit: Council recommendation -> {endorsement_id}; selected instructor
-- must be currently active/Auth-linked. Explicit current-semester attribution.
create function public.endorse_merit(p_key uuid, p_actor uuid, p_student uuid,
    p_instructor uuid, p_days integer, p_description text) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare v_result jsonb; v_semester uuid; v_id uuid;
begin
    perform public.f_cmd_council(p_actor);
    if p_student = p_actor then raise exception 'Self endorsement forbidden' using errcode = '42501'; end if;
    if p_days is null or p_days <= 0 or nullif(btrim(p_description), '') is null then raise exception 'Positive days and description required'; end if;
    v_result := public.f_cmd_begin(p_key, 'endorse_merit', p_actor, jsonb_build_object('student', p_student,
        'instructor', p_instructor, 'days', p_days, 'description', p_description));
    if v_result is not null then return v_result; end if;
    perform public.f_cmd_instructor(p_instructor);
    v_semester := public.f_cmd_current_semester();
    perform public.f_cmd_student(p_student, v_semester);
    insert into public.merit_endorsements(student_id, semester_id, assigned_instructor_id,
        description, requested_days, status, submitted_by, submitted_at)
        values (p_student, v_semester, p_instructor, p_description, p_days, 'pending', p_actor, now()) returning id into v_id;
    return public.f_cmd_finish(p_key, jsonb_build_object('endorsement_id', v_id));
end $$;

-- decide_merit_endorsement: decision approved/rejected; reason optional per scope;
-- approval awards on institutional TODAY (no approval backdating), retaining the
-- endorsement semester. Result {endorsement_id, status, unit_count}.
create function public.decide_merit_endorsement(p_key uuid, p_actor uuid, p_endorsement uuid,
    p_decision text, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare e public.merit_endorsements%rowtype; v_result jsonb; v_today date;
begin
    perform public.f_cmd_instructor(p_actor);
    if p_decision is null or p_decision not in ('approved','rejected') or (p_reason is not null and btrim(p_reason) = '') then raise exception 'Invalid endorsement decision'; end if;
    v_result := public.f_cmd_begin(p_key, 'decide_merit_endorsement', p_actor,
        jsonb_build_object('endorsement', p_endorsement, 'decision', p_decision, 'reason', p_reason));
    if v_result is not null then return v_result; end if;
    select * into e from public.merit_endorsements where id = p_endorsement for update;
    if not found or e.assigned_instructor_id <> p_actor or e.student_id = p_actor then raise exception 'Assigned instructor required' using errcode = '42501'; end if;
    if e.status <> 'pending' then raise exception 'Endorsement already decided'; end if;
    if p_decision = 'approved' then
        v_today := (clock_timestamp() at time zone public.f_cmd_timezone())::date;
        insert into public.merits(student_id, semester_id, source, endorsement_id, endorsement_unit_index,
            description, awarded_on, expires_on, awarded_by)
        select e.student_id, e.semester_id, 'endorsement', e.id, n, e.description, v_today,
            (v_today + interval '1 year')::date, p_actor from generate_series(1, e.requested_days) n;
        perform public.f_cmd_notice(e.student_id, 'merit_received');
    end if;
    update public.merit_endorsements set status = p_decision, decided_by = p_actor, decided_at = now(),
        decision_reason = p_reason where id = e.id;
    return public.f_cmd_finish(p_key, jsonb_build_object('endorsement_id', e.id, 'status', p_decision,
        'unit_count', case when p_decision = 'approved' then e.requested_days else 0 end));
end $$;

-- log_demerits: catalog required, Other requires description. Whole-day unit
-- count explicit; no configurable catalog default. external_source selects RLE
-- Coordinator route. Result {incident_group_id, unit_count}. Current context only.
create function public.log_demerits(p_key uuid, p_actor uuid, p_student uuid,
    p_bucket public.bucket, p_days integer, p_misconduct uuid, p_description text,
    p_incident_on date, p_external_source text default null) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare v_result jsonb; v_semester uuid; m public.misconduct_catalog%rowtype; v_description text;
begin
    if p_bucket is null then raise exception 'Bucket required'; end if;
    perform public.f_cmd_instructor(p_actor, p_bucket);
    if p_external_source is not null and (p_bucket <> 'rle' or not public.f_cmd_role(p_actor, 'RLE Coordinator')
        or nullif(btrim(p_external_source), '') is null) then raise exception 'External CI entry requires RLE Coordinator' using errcode = '42501'; end if;
    if p_student = p_actor then raise exception 'Self disciplinary entry forbidden' using errcode = '42501'; end if;
    if p_days is null or p_days <= 0 or p_incident_on is null or not isfinite(p_incident_on) then raise exception 'Positive unit count and incident date required'; end if;
    v_result := public.f_cmd_begin(p_key, 'log_demerits', p_actor, jsonb_build_object('student', p_student,
        'bucket', p_bucket, 'days', p_days, 'misconduct', p_misconduct, 'description', p_description,
        'incident_on', p_incident_on, 'external_source', p_external_source));
    if v_result is not null then return v_result; end if;
    select * into m from public.misconduct_catalog where id = p_misconduct and archived_at is null for share;
    if not found then raise exception 'Active misconduct option required'; end if;
    if m.is_other and nullif(btrim(p_description), '') is null then raise exception 'Other requires a specific incident description'; end if;
    v_description := m.label || case when nullif(btrim(p_description), '') is null then '' else ': ' || p_description end;
    v_semester := public.f_cmd_current_semester();
    perform public.f_cmd_student(p_student, v_semester);
    if p_incident_on > (clock_timestamp() at time zone public.f_cmd_timezone())::date
        or not exists (select 1 from public.semesters where id = v_semester and p_incident_on between starts_on and ends_on) then
        raise exception 'Incident date must be within current context and not future'; end if;
    perform pg_advisory_xact_lock(public.f_cmd_balance_key(p_student, p_bucket));
    insert into public.demerits(incident_group_id, incident_unit_index, student_id, semester_id, bucket,
        source, misconduct_id, description, incident_on, issued_by, external_source_name)
    select p_key, n, p_student, v_semester, p_bucket, case when p_external_source is null then 'faculty' else 'external_ci' end,
        m.id, v_description, p_incident_on, p_actor, p_external_source from generate_series(1, p_days) n;
    perform public.f_cmd_notice(p_student, 'demerit_incurred');
    return public.f_cmd_finish(p_key, jsonb_build_object('incident_group_id', p_key, 'unit_count', p_days));
end $$;

-- apply_merits: authenticated student election only (actor IS student); positive
-- requested days must fit BOTH current balance and available merits; reject rather
-- than silently change the election. Result {application_group_id, applied_days}.
-- Available strictly before expires_on in institutional timezone. Applied merit
-- offsets remain effective after their original expiry; no restoration/revocation.
create function public.apply_merits(p_key uuid, p_actor uuid, p_bucket public.bucket, p_days integer)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_result jsonb; v_today date; v_ids uuid[]; v_key bigint;
begin
    perform public.f_cmd_actor(p_actor);
    if p_bucket is null or p_days is null or p_days <= 0 then raise exception 'Positive whole-day election and bucket required'; end if;
    if not exists (select 1 from public.profiles where id = p_actor and university_id is not null)
        or not exists (select 1 from public.enrollments where student_id = p_actor) then raise exception 'Student identity required' using errcode = '42501'; end if;
    v_result := public.f_cmd_begin(p_key, 'apply_merits', p_actor, jsonb_build_object('bucket', p_bucket, 'days', p_days));
    if v_result is not null then return v_result; end if;
    for v_key in select public.f_cmd_balance_key(p_actor, b) from unnest(enum_range(null::public.bucket)) b order by 1 loop
        perform pg_advisory_xact_lock(v_key);
    end loop;
    if public.f_cmd_balance(p_actor, p_bucket) < p_days then raise exception 'Election exceeds matching outstanding balance' using errcode = '23514'; end if;
    v_today := (clock_timestamp() at time zone public.f_cmd_timezone())::date;
    select array_agg(id order by expires_on, id) into v_ids from (
        select m.id, m.expires_on from public.merits m where m.student_id = p_actor and m.awarded_on <= v_today
            and m.expires_on > v_today and not exists (select 1 from public.merit_applications a where a.merit_id = m.id)
        order by m.expires_on, m.id limit p_days for update of m) s;
    if coalesce(cardinality(v_ids), 0) <> p_days then raise exception 'Election exceeds available unexpired merits' using errcode = '23514'; end if;
    insert into public.merit_applications(application_group_id, student_id, merit_id, bucket, applied_at)
        select p_key, p_actor, id, p_bucket, now() from unnest(v_ids) id;
    return public.f_cmd_finish(p_key, jsonb_build_object('application_group_id', p_key, 'applied_days', p_days));
end $$;

-- waive_demerit: one unit only, reason required. Result deliberately reveals no
-- underlying balance or unrelated Faculty ledger to a Council caller.
create function public.waive_demerit(p_key uuid, p_actor uuid, p_demerit uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare d public.demerits%rowtype; v_student uuid; v_bucket public.bucket; v_result jsonb;
begin
    perform public.f_cmd_actor(p_actor);
    if nullif(btrim(p_reason), '') is null then raise exception 'Waiver reason required'; end if;
    -- Reauthorize even a successful retry after assignment removal.
    select * into d from public.demerits where id = p_demerit;
    if not found then raise exception 'Demerit not found'; end if;
    if d.source = 'council' then perform public.f_cmd_council(p_actor, false, true);
    else
        perform public.f_cmd_instructor(p_actor, d.bucket);
        if d.issued_by <> p_actor or (d.source = 'external_ci' and not public.f_cmd_role(p_actor, 'RLE Coordinator')) then
            raise exception 'Only original authorized issuer may waive this entry' using errcode = '42501'; end if;
    end if;
    v_result := public.f_cmd_begin(p_key, 'waive_demerit', p_actor, jsonb_build_object('demerit', p_demerit, 'reason', p_reason));
    if v_result is not null then return v_result; end if;
    select student_id, bucket into v_student, v_bucket from public.demerits where id = p_demerit;
    if not found then raise exception 'Demerit not found'; end if;
    perform pg_advisory_xact_lock(public.f_cmd_balance_key(v_student, v_bucket));
    select * into d from public.demerits where id = p_demerit for update;
    if d.student_id is distinct from v_student or d.bucket is distinct from v_bucket then raise exception 'Demerit context changed'; end if;
    if d.student_id = p_actor then raise exception 'Self demerit waiver forbidden' using errcode = '42501'; end if;
    if d.source = 'council' then
        perform public.f_cmd_council(p_actor, false, true);
    else
        perform public.f_cmd_instructor(p_actor, d.bucket);
        if d.issued_by <> p_actor or (d.source = 'external_ci' and not public.f_cmd_role(p_actor, 'RLE Coordinator')) then
            raise exception 'Only original authorized issuer may waive this entry' using errcode = '42501'; end if;
    end if;
    if d.waived_at is not null then raise exception 'Demerit already waived'; end if;
    if public.f_cmd_balance(d.student_id, d.bucket) <= 0 then raise exception 'Waiver is not eligible at current matching balance' using errcode = '23514'; end if;
    update public.demerits set waived_by = p_actor, waived_at = now(), waiver_reason = p_reason where id = d.id;
    return public.f_cmd_finish(p_key, jsonb_build_object('demerit_id', d.id, 'waived_at', now()));
end $$;
-- create_service_session: explicit typed one-day schedule; bucket authority,
-- institutional calendar day and all window ordering checked before insert.
-- Result {session_id}. Session schedule edits remain a parent-locked server
-- transaction; no post-end mutation is authorized by this handoff.
create function public.create_service_session(p_key uuid, p_actor uuid, p_bucket public.bucket,
    p_duty_on date, p_start timestamptz, p_end timestamptz, p_location text,
    p_late_after_minutes integer, p_time_in_from timestamptz, p_time_in_until timestamptz,
    p_time_out_from timestamptz, p_time_out_until timestamptz) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare v_result jsonb; v_id uuid; v_semester uuid; v_zone text;
begin
    if p_bucket is null then raise exception 'Bucket required'; end if;
    perform public.f_cmd_instructor(p_actor, p_bucket);
    v_result := public.f_cmd_begin(p_key, 'create_service_session', p_actor, jsonb_build_object(
        'bucket', p_bucket, 'duty_on', p_duty_on, 'start', p_start, 'end', p_end, 'location', p_location,
        'late_after_minutes', p_late_after_minutes, 'time_in_from', p_time_in_from, 'time_in_until', p_time_in_until,
        'time_out_from', p_time_out_from, 'time_out_until', p_time_out_until));
    if v_result is not null then return v_result; end if;
    v_zone := public.f_cmd_timezone();
    if p_duty_on is null or not isfinite(p_duty_on) or p_start is null or p_end is null
        or not isfinite(p_start) or not isfinite(p_end) or p_end <= p_start
        or (p_start at time zone v_zone)::date <> p_duty_on or (p_end at time zone v_zone)::date <> p_duty_on
        or p_late_after_minutes is null or p_late_after_minutes < 0
        or p_time_in_from is null or p_time_in_until is null or p_time_out_from is null or p_time_out_until is null
        or not isfinite(p_time_in_from) or not isfinite(p_time_in_until) or not isfinite(p_time_out_from) or not isfinite(p_time_out_until)
        or p_time_in_until < p_time_in_from or p_time_out_until < p_time_out_from then raise exception 'Invalid one-day service schedule/windows'; end if;
    v_semester := public.f_cmd_current_semester();
    if not exists (select 1 from public.semesters where id = v_semester and p_duty_on between starts_on and ends_on) then raise exception 'Duty day must belong to current academic context'; end if;
    insert into public.service_sessions(semester_id, bucket, duty_on, scheduled_start, scheduled_end,
        location, late_after_minutes, time_in_from, time_in_until, time_out_from, time_out_until, created_by, updated_at)
    values (v_semester, p_bucket, p_duty_on, p_start, p_end, p_location, p_late_after_minutes,
        p_time_in_from, p_time_in_until, p_time_out_from, p_time_out_until, p_actor, now()) returning id into v_id;
    return public.f_cmd_finish(p_key, jsonb_build_object('session_id', v_id));
end $$;

-- set_service_participants: <=10000 exact full-replacement row objects
-- {student_id:uuid,time_in:timestamptz|null,time_out:timestamptz|null,excluded:boolean}.
-- Inserts selection or corrects existing attendance/exclusion; never deletes a
-- participant/history. Missing times allowed before finalization. All batch rows
-- share the same session parent lock. Result {session_id, updated_count}.
create function public.set_service_participants(p_key uuid, p_actor uuid, p_session uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare s public.service_sessions%rowtype; v_result jsonb; x record;
begin
    select * into s from public.service_sessions where id = p_session;
    if not found then raise exception 'Service session not found'; end if;
    perform public.f_cmd_instructor(p_actor, s.bucket);
    if s.created_by <> p_actor then raise exception 'Session issuer required' using errcode = '42501'; end if;
    if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 10000 then raise exception 'Invalid participant batch'; end if;
    v_result := public.f_cmd_begin(p_key, 'set_service_participants', p_actor,
        jsonb_build_object('session', p_session, 'rows', p_rows));
    if v_result is not null then return v_result; end if;
    select * into s from public.service_sessions where id = p_session for update;
    if s.ended_at is not null then raise exception 'Service attendance is finalized'; end if;
    if s.created_by <> p_actor then raise exception 'Session issuer changed' using errcode = '42501'; end if;
    if exists (select 1 from jsonb_array_elements(p_rows) a(v) where jsonb_typeof(v) <> 'object'
        or v - array['student_id','time_in','time_out','excluded']::text[] <> '{}'::jsonb
        or not (v ?& array['student_id','time_in','time_out','excluded'])
        or jsonb_typeof(v->'excluded') <> 'boolean') then raise exception 'Invalid participant row shape'; end if;
    if (select count(distinct (v->>'student_id')::uuid) from jsonb_array_elements(p_rows) a(v)) <> jsonb_array_length(p_rows) then raise exception 'Duplicate or missing student identity'; end if;
    for x in select * from jsonb_to_recordset(p_rows) t(student_id uuid, time_in timestamptz, time_out timestamptz, excluded boolean) loop
        perform public.f_cmd_student(x.student_id, s.semester_id);
        if x.student_id = p_actor then raise exception 'Self attendance recording forbidden' using errcode = '42501'; end if;
        if (x.time_in is not null and (not (x.time_in between s.time_in_from and s.time_in_until) or x.time_in > clock_timestamp()))
            or (x.time_out is not null and (not (x.time_out between s.time_out_from and s.time_out_until)
                or x.time_in is null or x.time_out <= x.time_in or x.time_out > clock_timestamp())) then raise exception 'Invalid service attendance'; end if;
        insert into public.service_participants(session_id, student_id, semester_id, bucket, time_in, time_out,
            recorded_by, excluded_at, excluded_by, updated_at)
        values (s.id, x.student_id, s.semester_id, s.bucket, x.time_in, x.time_out,
            case when x.time_in is not null then p_actor end, case when x.excluded then now() end,
            case when x.excluded then p_actor end, now())
        on conflict (session_id, student_id) do update set time_in = excluded.time_in, time_out = excluded.time_out,
            recorded_by = excluded.recorded_by, excluded_at = excluded.excluded_at, excluded_by = excluded.excluded_by, updated_at = now();
    end loop;
    return public.f_cmd_finish(p_key, jsonb_build_object('session_id', s.id, 'updated_count', jsonb_array_length(p_rows)));
end $$;

-- end_service_session: issuer explicitly confirms duty complete by calling.
-- Included attendance must be valid; lateness NEVER reduces service credit.
-- Result {session_id, ended_at, completed_count, credit_count}; repeat finalization
-- under another key returns original completion counts, even after revocation.
create function public.end_service_session(p_key uuid, p_actor uuid, p_session uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare s public.service_sessions%rowtype; a public.service_participants%rowtype;
    v_result jsonb; v_zone text; v_key bigint;
begin
    select * into s from public.service_sessions where id = p_session;
    if not found then raise exception 'Service session not found'; end if;
    perform public.f_cmd_instructor(p_actor, s.bucket);
    if s.created_by <> p_actor then raise exception 'Only session issuer may finalize' using errcode = '42501'; end if;
    v_result := public.f_cmd_begin(p_key, 'end_service_session', p_actor, jsonb_build_object('session', p_session));
    if v_result is not null then return v_result; end if;
    select * into s from public.service_sessions where id = p_session for update;
    if s.created_by <> p_actor then raise exception 'Session issuer changed' using errcode = '42501'; end if;
    if s.ended_at is null then
        v_zone := public.f_cmd_timezone();
        if not isfinite(s.scheduled_start) or not isfinite(s.scheduled_end)
            or (s.scheduled_start at time zone v_zone)::date <> s.duty_on
            or (s.scheduled_end at time zone v_zone)::date <> s.duty_on
            or clock_timestamp() < s.scheduled_end then raise exception 'Valid same-duty-day completed schedule required'; end if;
        if exists (select 1 from public.service_participants where session_id = s.id and excluded_at is null
            and (student_id = p_actor or time_in is null or time_out is null or recorded_by is null
                or not (time_in between s.time_in_from and s.time_in_until)
                or not (time_out between s.time_out_from and s.time_out_until)
                or time_out <= time_in or time_out > clock_timestamp())) then raise exception 'Included service attendance is incomplete or invalid'; end if;
        for v_key in select distinct public.f_cmd_balance_key(student_id, s.bucket)
            from public.service_participants where session_id = s.id and excluded_at is null order by 1 loop
            perform pg_advisory_xact_lock(v_key);
        end loop;
        for a in select * from public.service_participants where session_id = s.id and excluded_at is null order by student_id loop
            if public.f_cmd_balance(a.student_id, s.bucket) > 0 then
                insert into public.service_credits(student_id, semester_id, bucket, session_id,
                    service_participant_id, issued_by, issued_at)
                    values (a.student_id, s.semester_id, s.bucket, s.id, a.id, p_actor, now());
            end if;
            perform public.f_cmd_notice(a.student_id, 'service_recorded');
        end loop;
        update public.service_sessions set ended_by = p_actor, ended_at = now(), updated_at = now()
            where id = s.id returning ended_at into s.ended_at;
    end if;
    return public.f_cmd_finish(p_key, jsonb_build_object('session_id', s.id, 'ended_at', s.ended_at,
        'completed_count', (select count(*) from public.service_participants where session_id = s.id and excluded_at is null),
        'credit_count', (select count(*) from public.service_credits where session_id = s.id)));
end $$;

-- revoke_service_credit: issuer only, mandatory reason, one-way history.
-- Result {credit_id, revoked_at}; no attendance mutation or regeneration.
create function public.revoke_service_credit(p_key uuid, p_actor uuid, p_credit uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare c public.service_credits%rowtype; v_result jsonb; v_student uuid; v_bucket public.bucket;
begin
    select * into c from public.service_credits where id = p_credit;
    if not found then raise exception 'Credit not found'; end if;
    perform public.f_cmd_instructor(p_actor, c.bucket);
    if c.issued_by <> p_actor then raise exception 'Credit issuer required' using errcode = '42501'; end if;
    if nullif(btrim(p_reason), '') is null then raise exception 'Revocation reason required'; end if;
    v_student := c.student_id; v_bucket := c.bucket;
    v_result := public.f_cmd_begin(p_key, 'revoke_service_credit', p_actor, jsonb_build_object('credit', p_credit, 'reason', p_reason));
    if v_result is not null then return v_result; end if;
    perform pg_advisory_xact_lock(public.f_cmd_balance_key(v_student, v_bucket));
    select * into c from public.service_credits where id = p_credit for update;
    if c.issued_by <> p_actor or c.student_id is distinct from v_student or c.bucket is distinct from v_bucket then raise exception 'Credit context changed'; end if;
    if c.student_id = p_actor then raise exception 'Self credit mutation forbidden' using errcode = '42501'; end if;
    if c.revoked_at is not null then raise exception 'Credit already revoked'; end if;
    update public.service_credits set revoked_at = now(), revoked_by = p_actor, revocation_reason = p_reason where id = c.id;
    return public.f_cmd_finish(p_key, jsonb_build_object('credit_id', c.id, 'revoked_at', now()));
end $$;

-- confirm_clearance: council/academic/rle, explicit semester, enrolled beneficiary;
-- Council prerequisite for matching Faculty component, NOT financial/balance zero.
-- Result {clearance_id, confirmed_at}. Existing permanent confirmation is returned
-- without rewriting original actor/time. No withdrawal/update/delete entry point.
create function public.confirm_clearance(p_key uuid, p_actor uuid, p_student uuid,
    p_semester uuid, p_component text) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare v_result jsonb; c public.clearances%rowtype;
begin
    if p_component is null or p_component not in ('council','academic','rle') then raise exception 'Invalid clearance component'; end if;
    if p_component = 'council' then perform public.f_cmd_council(p_actor);
    else
        perform public.f_cmd_instructor(p_actor, case p_component when 'academic' then 'office'::public.bucket else 'rle'::public.bucket end);
        if not public.f_cmd_role(p_actor, case p_component when 'academic' then 'Academic Coordinator' else 'RLE Coordinator' end) then
            raise exception 'Matching coordinator assignment required' using errcode = '42501'; end if;
    end if;
    if p_student = p_actor then raise exception 'Self clearance forbidden' using errcode = '42501'; end if;
    v_result := public.f_cmd_begin(p_key, 'confirm_clearance', p_actor,
        jsonb_build_object('student', p_student, 'semester', p_semester, 'component', p_component));
    if v_result is not null then return v_result; end if;
    perform public.f_cmd_student(p_student, p_semester);
    perform pg_advisory_xact_lock(hashtextextended('florence:clearance:' || p_student::text || ':' || p_semester::text, 0));
    if p_component <> 'council' and not exists (select 1 from public.clearances
        where student_id = p_student and semester_id = p_semester and component = 'council') then raise exception 'Council clearance for same semester is required'; end if;
    select * into c from public.clearances where student_id = p_student and semester_id = p_semester and component = p_component;
    if not found then
        insert into public.clearances(student_id, semester_id, component, confirmed_by, confirmed_at)
            values (p_student, p_semester, p_component, p_actor, now()) returning * into c;
    end if;
    return public.f_cmd_finish(p_key, jsonb_build_object('clearance_id', c.id, 'confirmed_at', c.confirmed_at));
end $$;
-- publish_fee_obligations: explicit semester and audience arrays; definition
-- locked while snapshotting. Overlap is skipped, never duplicates existing debt.
-- Result {publication_id, obligation_count}; exact retry works even for zero rows.
create function public.publish_fee_obligations(p_key uuid, p_actor uuid, p_fee uuid,
    p_semester uuid, p_year_levels smallint[], p_academic_statuses text[]) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare f public.fee_definitions%rowtype; v_result jsonb; v_id uuid; v_count bigint; x record;
begin
    perform public.f_cmd_council(p_actor);
    -- Reuse structural array constraints on the publication; null/empty input is
    -- rejected by those constraints before any obligations can commit.
    v_result := public.f_cmd_begin(p_key, 'publish_fee_obligations', p_actor,
        jsonb_build_object('fee', p_fee, 'semester', p_semester, 'years', p_year_levels, 'statuses', p_academic_statuses));
    if v_result is not null then return v_result; end if;
    -- Definition row serializes overlapping publications and definition edits.
    select * into f from public.fee_definitions where id = p_fee and archived_at is null for update;
    if not found then raise exception 'Active fee definition required'; end if;
    insert into public.fee_publications(request_key, fee_definition_id, semester_id, year_levels,
        academic_statuses, description, amount, published_by, published_at)
        values (p_key, f.id, p_semester, p_year_levels, p_academic_statuses, f.name, f.amount, p_actor, now()) returning id into v_id;
    insert into public.obligations(student_id, semester_id, kind, fee_definition_id, fee_publication_id, description, amount)
    select n.student_id, p_semester, 'fee', f.id, v_id, f.name, f.amount from public.enrollments n
        where n.semester_id = p_semester and n.year_level = any(p_year_levels)
        and n.academic_status::text = any(p_academic_statuses)
        and not exists (select 1 from public.obligations o where o.kind = 'fee' and o.fee_definition_id = f.id
            and o.student_id = n.student_id and o.semester_id = p_semester);
    get diagnostics v_count = row_count;
    for x in select student_id from public.obligations where fee_publication_id = v_id loop
        perform public.f_cmd_notice(x.student_id, 'obligation_due');
    end loop;
    return public.f_cmd_finish(p_key, jsonb_build_object('publication_id', v_id, 'obligation_count', v_count));
end $$;

-- Explicit ACL allowlist: no schema-wide function grants/default privileges.
-- No helper is callable even by service_role: helpers execute only under the
-- migration owner's SECURITY DEFINER context reached through approved RPCs.
do $acl$
declare f record;
begin
    for f in select p.oid::regprocedure signature, p.proname from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
        and (p.proname = any(array[
            'f_cmd_actor','f_cmd_role','f_cmd_council','f_cmd_instructor','f_cmd_student',
            'f_cmd_timezone','f_cmd_current_semester','f_cmd_begin','f_cmd_finish','f_cmd_balance_key',
            'f_cmd_balance','f_cmd_notice','f_cmd_freeze_event','f_cmd_settled','f_cmd_lock_obligations',
            'f_cmd_item_total','f_cmd_check_items',
            'freeze_event','prepare_event_capture','capture_event_attendance','generate_event_consequences',
            'record_cash_payment','verify_payment','record_refund','waive_obligation','correct_payment',
            'award_merits','endorse_merit','decide_merit_endorsement','log_demerits','apply_merits','waive_demerit',
            'create_service_session','set_service_participants','end_service_session','revoke_service_credit',
            'confirm_clearance','publish_fee_obligations'])) loop
        -- Stable timestamptz JSON representation for exact retries regardless of
        -- the connection's TimeZone. Academic calendar dates use approved zone.
        execute format('alter function %s set TimeZone = %L', f.signature, 'UTC');
        execute format('revoke all on function %s from public, anon, authenticated, service_role', f.signature);
        if left(f.proname, 6) <> 'f_cmd_' then
            execute format('grant execute on function %s to service_role', f.signature);
        end if;
    end loop;
end $acl$;
grant usage on type public.bucket to service_role;
commit;
