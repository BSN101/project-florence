-- Platform Admin provisioning (FL-001, FL-010 Executive changes, FL-011).
-- SECURITY: the server resolves p_actor from a verified Auth session; only
-- service_role may execute entry points. Same contract as florence_commands.
--
-- Invitation tokens are Florence-owned: the server emails a random token and
-- passes only its SHA-256 hex hash. The Auth user is created at acceptance, and
-- accept_invitation links it in the same transaction that accepts the row.
--
-- Retry identity excludes p_token_hash/p_expires_at: a retry carries a fresh
-- token, and the original raw token is gone. Replays return the stored result
-- with replayed=true and insert nothing; the server then sends no email.
--
-- Lock order: request key -> profile -> email advisory key -> invitation.
-- provision_faculty has no existing profile, so it goes request -> email key.
begin;

-- Schema ----------------------------------------------------------------------

-- Verified empty on 2026-11-12, so NOT NULL needs no backfill. Fails safely if not.
alter table public.invitations add column purpose text not null
    check (purpose in ('faculty_access', 'student_access'));
create unique index invitations_one_pending_per_profile on public.invitations (profile_id)
    where status = 'pending';
-- Verified no duplicates on 2026-11-12. Student emails stay non-unique here.
create unique index profiles_staff_email_unique on public.profiles (lower(btrim(email)))
    where university_id is null and email is not null;

-- Same as 20261107050406 except the invitations branch: expired only after the
-- deadline, and purpose must match the profile category.
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
  if new.kind not in ('merit_received','demerit_incurred','service_recorded','obligation_due','payment_verified','payment_rejected')
   or new.target_type is not null then raise exception 'Unapproved notification category/navigation'; end if;
 end if;
 return new;
end $$;

-- Private helpers (never granted) ----------------------------------------------

create function public.f_cmd_platform_admin(p_actor uuid) returns void
language plpgsql security definer set search_path = pg_catalog as $$
begin
    perform public.f_cmd_actor(p_actor);
    if not public.f_cmd_role(p_actor, 'Platform Admin') then
        raise exception 'Platform Admin required' using errcode = '42501';
    end if;
end $$;

create function public.f_cmd_email(p_email text) returns text
language plpgsql immutable security definer set search_path = pg_catalog as $$
declare v text := lower(btrim(p_email));
begin
    if v is null or length(v) > 254 or v !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
        raise exception 'Valid email required' using errcode = '22023';
    end if;
    return v;
end $$;

-- Serializes provisioning per email; Auth users exist only for accepted accounts.
create function public.f_cmd_email_free(p_email text, p_except uuid) returns void
language plpgsql security definer set search_path = pg_catalog as $$
begin
    perform pg_advisory_xact_lock(hashtextextended('florence:email:' || p_email, 0));
    if exists (select 1 from public.profiles where lower(btrim(email)) = p_email and id is distinct from p_except) then
        raise exception 'Email already belongs to a Florence profile' using errcode = '23505';
    end if;
    if exists (select 1 from auth.users where lower(email) = p_email) then
        raise exception 'Email already belongs to a sign-in account' using errcode = '23505';
    end if;
end $$;

create function public.f_cmd_token(p_token_hash text, p_expires_at timestamptz) returns void
language plpgsql security definer set search_path = pg_catalog as $$
begin
    if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
        raise exception 'SHA-256 hex invitation token hash required' using errcode = '22023';
    end if;
    if p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '30 days' then
        raise exception 'Invitation expiry must be in the next 30 days' using errcode = '22023';
    end if;
end $$;

create function public.f_cmd_names(p_first text, p_middle text, p_last text, p_suffix text) returns jsonb
language plpgsql immutable security definer set search_path = pg_catalog as $$
begin
    if nullif(btrim(p_first), '') is null or nullif(btrim(p_last), '') is null then
        raise exception 'First and last name required' using errcode = '22023';
    end if;
    return jsonb_build_object('first_name', btrim(p_first), 'middle_name', nullif(btrim(p_middle), ''),
        'last_name', btrim(p_last), 'suffix', nullif(btrim(p_suffix), ''));
end $$;

-- Locks a non-student, non-Platform-Admin profile for a Faculty command.
create function public.f_cmd_faculty_target(p_profile uuid) returns public.profiles
language plpgsql security definer set search_path = pg_catalog as $$
declare p public.profiles%rowtype;
begin
    select * into p from public.profiles where id = p_profile for update;
    if not found or p.university_id is not null then
        raise exception 'Faculty profile not found' using errcode = '22023';
    end if;
    if exists (select 1 from public.role_assignments where profile_id = p.id
        and role = 'Platform Admin' and removed_at is null) then
        raise exception 'Platform Admin profiles are outside this workflow' using errcode = '42501';
    end if;
    return p;
end $$;

-- Locks a student profile for an Executive command.
create function public.f_cmd_student_target(p_profile uuid) returns public.profiles
language plpgsql security definer set search_path = pg_catalog as $$
declare p public.profiles%rowtype;
begin
    select * into p from public.profiles where id = p_profile for update;
    if not found or p.university_id is null then
        raise exception 'Student profile not found' using errcode = '22023';
    end if;
    return p;
end $$;

-- Closes the open invitation: expired if past its deadline, otherwise cancelled.
create function public.f_cmd_close_pending_invitation(p_profile uuid) returns boolean
language plpgsql security definer set search_path = pg_catalog as $$
begin
    update public.invitations
        set status = case when expires_at <= clock_timestamp() then 'expired' else 'cancelled' end,
            cancelled_at = case when expires_at <= clock_timestamp() then null else now() end
        where profile_id = p_profile and status = 'pending';
    return found;
end $$;

create function public.f_cmd_archive_blockers(p_profile uuid) returns jsonb
language sql stable security definer set search_path = pg_catalog as $$
    select jsonb_build_object(
        'pending_endorsements', coalesce((select jsonb_agg(e.id order by e.submitted_at, e.id)
            from public.merit_endorsements e where e.assigned_instructor_id = p_profile and e.status = 'pending'), '[]'::jsonb),
        'open_service_sessions', coalesce((select jsonb_agg(s.id order by s.scheduled_start, s.id)
            from public.service_sessions s where s.created_by = p_profile and s.ended_at is null), '[]'::jsonb),
        -- Only the issuer may waive these, so archiving makes them permanently unwaivable.
        'unwaived_issued_demerits', (select count(*) from public.demerits d
            where d.issued_by = p_profile and d.source in ('faculty', 'external_ci') and d.waived_at is null))
$$;

-- Faculty commands -------------------------------------------------------------

create function public.provision_faculty(p_key uuid, p_actor uuid, p_first_name text, p_middle_name text,
    p_last_name text, p_suffix text, p_email text, p_instructor_role text, p_coordinator boolean,
    p_token_hash text, p_expires_at timestamptz) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare v_names jsonb; v_email text; v_result jsonb; v_profile uuid; v_invitation uuid;
begin
    perform public.f_cmd_platform_admin(p_actor);
    v_names := public.f_cmd_names(p_first_name, p_middle_name, p_last_name, p_suffix);
    v_email := public.f_cmd_email(p_email);
    if p_instructor_role is null or p_instructor_role not in ('Academic Instructor', 'Clinical Instructor') or p_coordinator is null then
        raise exception 'One instructor role and a coordinator choice are required' using errcode = '22023';
    end if;
    v_result := public.f_cmd_begin(p_key, 'provision_faculty', p_actor, v_names || jsonb_build_object(
        'email', v_email, 'instructor_role', p_instructor_role, 'coordinator', p_coordinator));
    if v_result is not null then return v_result || jsonb_build_object('replayed', true); end if;
    perform public.f_cmd_token(p_token_hash, p_expires_at);
    perform public.f_cmd_email_free(v_email, null);
    insert into public.profiles (first_name, middle_name, last_name, suffix, email, account_status, updated_at)
        values (v_names->>'first_name', v_names->>'middle_name', v_names->>'last_name', v_names->>'suffix',
            v_email, 'active', now())
        returning id into v_profile;
    insert into public.role_assignments (profile_id, role, assigned_by, assigned_at)
        values (v_profile, p_instructor_role, p_actor, now());
    if p_coordinator then
        insert into public.role_assignments (profile_id, role, assigned_by, assigned_at)
            values (v_profile, case p_instructor_role when 'Academic Instructor' then 'Academic Coordinator'
                else 'RLE Coordinator' end, p_actor, now());
    end if;
    insert into public.invitations (profile_id, email, purpose, status, token_hash, expires_at, created_by)
        values (v_profile, v_email, 'faculty_access', 'pending', p_token_hash, p_expires_at, p_actor)
        returning id into v_invitation;
    return public.f_cmd_finish(p_key, jsonb_build_object('profile_id', v_profile,
        'invitation_id', v_invitation, 'replayed', false));
end $$;

create function public.update_faculty_identity(p_key uuid, p_actor uuid, p_profile uuid, p_first_name text,
    p_middle_name text, p_last_name text, p_suffix text, p_email text) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare v_names jsonb; v_email text; v_result jsonb; p public.profiles%rowtype;
    v_changed boolean := false; v_closed boolean := false;
begin
    perform public.f_cmd_platform_admin(p_actor);
    v_names := public.f_cmd_names(p_first_name, p_middle_name, p_last_name, p_suffix);
    v_email := public.f_cmd_email(p_email);
    v_result := public.f_cmd_begin(p_key, 'update_faculty_identity', p_actor,
        v_names || jsonb_build_object('profile', p_profile, 'email', v_email));
    if v_result is not null then return v_result || jsonb_build_object('replayed', true); end if;
    p := public.f_cmd_faculty_target(p_profile);
    if p.account_status <> 'active' then raise exception 'Archived profiles cannot be edited' using errcode = '55000'; end if;
    v_changed := v_email is distinct from lower(btrim(p.email));
    if v_changed then
        if p.auth_user_id is not null then
            raise exception 'Changing the sign-in email of an accepted account is not supported' using errcode = '0A000';
        end if;
        perform public.f_cmd_email_free(v_email, p.id);
        v_closed := public.f_cmd_close_pending_invitation(p.id);
    end if;
    update public.profiles set first_name = v_names->>'first_name', middle_name = v_names->>'middle_name',
        last_name = v_names->>'last_name', suffix = v_names->>'suffix', email = v_email, updated_at = now()
        where id = p.id;
    return public.f_cmd_finish(p_key, jsonb_build_object('profile_id', p.id, 'email_changed', v_changed,
        'invitation_closed', v_closed, 'replayed', false));
end $$;

-- assignment_check rejects any invalid combination at commit.
create function public.change_faculty_assignments(p_key uuid, p_actor uuid, p_profile uuid,
    p_instructor_role text, p_coordinator boolean) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare v_result jsonb; p public.profiles%rowtype; v_wanted text[];
begin
    perform public.f_cmd_platform_admin(p_actor);
    if p_instructor_role is null or p_instructor_role not in ('Academic Instructor', 'Clinical Instructor') or p_coordinator is null then
        raise exception 'One instructor role and a coordinator choice are required' using errcode = '22023';
    end if;
    v_result := public.f_cmd_begin(p_key, 'change_faculty_assignments', p_actor, jsonb_build_object(
        'profile', p_profile, 'instructor_role', p_instructor_role, 'coordinator', p_coordinator));
    if v_result is not null then return v_result || jsonb_build_object('replayed', true); end if;
    p := public.f_cmd_faculty_target(p_profile);
    if p.account_status <> 'active' then raise exception 'Archived profiles cannot be changed' using errcode = '55000'; end if;
    v_wanted := array[p_instructor_role] || case when p_coordinator then array[case p_instructor_role
        when 'Academic Instructor' then 'Academic Coordinator' else 'RLE Coordinator' end] else array[]::text[] end;
    update public.role_assignments set removed_by = p_actor, removed_at = now()
        where profile_id = p.id and removed_at is null and not (role = any(v_wanted));
    insert into public.role_assignments (profile_id, role, assigned_by, assigned_at)
        select p.id, r, p_actor, now() from unnest(v_wanted) r
        where not exists (select 1 from public.role_assignments a where a.profile_id = p.id
            and a.role = r and a.removed_at is null);
    return public.f_cmd_finish(p_key, jsonb_build_object('profile_id', p.id, 'roles', to_jsonb(v_wanted), 'replayed', false));
end $$;

create function public.faculty_archive_preview(p_actor uuid, p_profile uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare p public.profiles%rowtype;
begin
    perform public.f_cmd_platform_admin(p_actor);
    p := public.f_cmd_faculty_target(p_profile);
    return public.f_cmd_archive_blockers(p.id) || jsonb_build_object('account_status', p.account_status);
end $$;

create function public.archive_faculty(p_key uuid, p_actor uuid, p_profile uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare v_result jsonb; p public.profiles%rowtype; v_blockers jsonb; v_closed integer; v_invitation boolean;
begin
    perform public.f_cmd_platform_admin(p_actor);
    v_result := public.f_cmd_begin(p_key, 'archive_faculty', p_actor, jsonb_build_object('profile', p_profile));
    if v_result is not null then return v_result || jsonb_build_object('replayed', true); end if;
    p := public.f_cmd_faculty_target(p_profile);
    if p.account_status <> 'active' then raise exception 'Profile is already archived' using errcode = '55000'; end if;
    v_blockers := public.f_cmd_archive_blockers(p.id);
    if jsonb_array_length(v_blockers->'pending_endorsements') > 0
        or jsonb_array_length(v_blockers->'open_service_sessions') > 0 then
        raise exception 'Archive blocked by pending work' using errcode = '55000', detail = v_blockers::text;
    end if;
    update public.role_assignments set removed_by = p_actor, removed_at = now()
        where profile_id = p.id and removed_at is null;
    get diagnostics v_closed = row_count;
    v_invitation := public.f_cmd_close_pending_invitation(p.id);
    update public.profiles set account_status = 'archived', updated_at = now() where id = p.id;
    return public.f_cmd_finish(p_key, jsonb_build_object('profile_id', p.id, 'closed_assignments', v_closed,
        'invitation_closed', v_invitation,
        'unwaived_issued_demerits', v_blockers->'unwaived_issued_demerits', 'replayed', false));
end $$;

-- Executive commands -----------------------------------------------------------

create function public.grant_executive(p_key uuid, p_actor uuid, p_university_id text, p_label text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_result jsonb; v_profile uuid; p public.profiles%rowtype; m public.council_memberships%rowtype; v_id uuid;
begin
    perform public.f_cmd_platform_admin(p_actor);
    if p_university_id is null or p_university_id !~ '^[0-9]{2}-1-[0-9]{5}$' then
        raise exception 'Exact university number required' using errcode = '22023';
    end if;
    if nullif(btrim(p_label), '') is null then raise exception 'Position label required' using errcode = '22023'; end if;
    v_result := public.f_cmd_begin(p_key, 'grant_executive', p_actor, jsonb_build_object(
        'university_id', p_university_id, 'label', btrim(p_label)));
    if v_result is not null then return v_result || jsonb_build_object('replayed', true); end if;
    select id into v_profile from public.profiles where university_id = p_university_id;
    p := public.f_cmd_student_target(v_profile);
    if not exists (select 1 from public.enrollments where student_id = p.id) then
        raise exception 'Enrolled student not found' using errcode = '22023';
    end if;
    if p.account_status <> 'active' then
        raise exception 'Archived students cannot receive Executive access' using errcode = '55000';
    end if;
    select * into m from public.council_memberships where profile_id = p.id and removed_at is null for update;
    if found and m.access_role = 'executive' then
        raise exception 'Student already has Executive access' using errcode = '55000';
    end if;
    if found then
        update public.council_memberships set removed_by = p_actor, removed_at = now() where id = m.id;
    end if;
    insert into public.council_memberships (profile_id, access_role, position_label, assigned_by, assigned_at)
        values (p.id, 'executive', btrim(p_label), p_actor, now()) returning id into v_id;
    return public.f_cmd_finish(p_key, jsonb_build_object('profile_id', p.id, 'membership_id', v_id,
        'replaced_access_role', m.access_role, 'replayed', false));
end $$;

create function public.replace_executive(p_key uuid, p_actor uuid, p_profile uuid, p_access_role text, p_label text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_result jsonb; p public.profiles%rowtype; m public.council_memberships%rowtype; v_id uuid;
begin
    perform public.f_cmd_platform_admin(p_actor);
    if p_access_role is null or p_access_role not in ('operations', 'representative') then
        raise exception 'Operations or Representative required' using errcode = '22023';
    end if;
    if nullif(btrim(p_label), '') is null then raise exception 'Position label required' using errcode = '22023'; end if;
    v_result := public.f_cmd_begin(p_key, 'replace_executive', p_actor, jsonb_build_object(
        'profile', p_profile, 'access_role', p_access_role, 'label', btrim(p_label)));
    if v_result is not null then return v_result || jsonb_build_object('replayed', true); end if;
    p := public.f_cmd_student_target(p_profile);
    if p.account_status <> 'active' then raise exception 'Archived students cannot receive Council access' using errcode = '55000'; end if;
    select * into m from public.council_memberships where profile_id = p.id and removed_at is null for update;
    if not found or m.access_role <> 'executive' then
        raise exception 'Student has no active Executive access' using errcode = '55000';
    end if;
    update public.council_memberships set removed_by = p_actor, removed_at = now() where id = m.id;
    insert into public.council_memberships (profile_id, access_role, position_label, assigned_by, assigned_at)
        values (p.id, p_access_role::public.council_access_role, btrim(p_label), p_actor, now()) returning id into v_id;
    return public.f_cmd_finish(p_key, jsonb_build_object('profile_id', p.id, 'membership_id', v_id, 'replayed', false));
end $$;

create function public.remove_executive(p_key uuid, p_actor uuid, p_profile uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare v_result jsonb; p public.profiles%rowtype; m public.council_memberships%rowtype;
begin
    perform public.f_cmd_platform_admin(p_actor);
    v_result := public.f_cmd_begin(p_key, 'remove_executive', p_actor, jsonb_build_object('profile', p_profile));
    if v_result is not null then return v_result || jsonb_build_object('replayed', true); end if;
    p := public.f_cmd_student_target(p_profile);
    select * into m from public.council_memberships where profile_id = p.id and removed_at is null for update;
    if not found or m.access_role <> 'executive' then
        raise exception 'Student has no active Executive access' using errcode = '55000';
    end if;
    update public.council_memberships set removed_by = p_actor, removed_at = now() where id = m.id;
    return public.f_cmd_finish(p_key, jsonb_build_object('profile_id', p.id, 'membership_id', m.id, 'replayed', false));
end $$;

-- Invitation commands ----------------------------------------------------------

create function public.cancel_invitation(p_key uuid, p_actor uuid, p_invitation uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare v_result jsonb; v_profile uuid; i public.invitations%rowtype;
begin
    perform public.f_cmd_platform_admin(p_actor);
    v_result := public.f_cmd_begin(p_key, 'cancel_invitation', p_actor, jsonb_build_object('invitation', p_invitation));
    if v_result is not null then return v_result || jsonb_build_object('replayed', true); end if;
    select profile_id into v_profile from public.invitations where id = p_invitation;
    perform 1 from public.profiles where id = v_profile for update;
    select * into i from public.invitations where id = p_invitation for update;
    -- Platform Admin scope is Faculty first access only; student invitations belong to Council.
    if not found or i.purpose <> 'faculty_access' then
        raise exception 'Invitation is outside Platform Admin scope' using errcode = '42501';
    end if;
    if i.status <> 'pending' then raise exception 'Only pending invitations can be cancelled' using errcode = '55000'; end if;
    update public.invitations set status = 'cancelled', cancelled_at = now() where id = i.id;
    return public.f_cmd_finish(p_key, jsonb_build_object('invitation_id', i.id, 'replayed', false));
end $$;

create function public.reissue_invitation(p_key uuid, p_actor uuid, p_profile uuid, p_token_hash text,
    p_expires_at timestamptz) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare v_result jsonb; p public.profiles%rowtype; v_id uuid; v_closed boolean;
begin
    perform public.f_cmd_platform_admin(p_actor);
    v_result := public.f_cmd_begin(p_key, 'reissue_invitation', p_actor, jsonb_build_object('profile', p_profile));
    if v_result is not null then return v_result || jsonb_build_object('replayed', true); end if;
    perform public.f_cmd_token(p_token_hash, p_expires_at);
    p := public.f_cmd_faculty_target(p_profile);
    if p.account_status <> 'active' then raise exception 'Archived profiles cannot be invited' using errcode = '55000'; end if;
    if p.auth_user_id is not null then raise exception 'Account has already been set up' using errcode = '55000'; end if;
    if p.email is null then raise exception 'Profile email required' using errcode = '22023'; end if;
    v_closed := public.f_cmd_close_pending_invitation(p.id);
    insert into public.invitations (profile_id, email, purpose, status, token_hash, expires_at, created_by)
        values (p.id, lower(btrim(p.email)), 'faculty_access', 'pending', p_token_hash, p_expires_at, p_actor)
        returning id into v_id;
    return public.f_cmd_finish(p_key, jsonb_build_object('profile_id', p.id, 'invitation_id', v_id,
        'previous_closed', v_closed, 'replayed', false));
end $$;

-- Token-holder entry points: no actor exists yet; the token is the credential.
create function public.check_invitation(p_token_hash text) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog as $$
declare v jsonb;
begin
    if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('usable', false); end if;
    select jsonb_build_object('usable', true, 'email', i.email, 'first_name', p.first_name, 'last_name', p.last_name)
        into v from public.invitations i join public.profiles p on p.id = i.profile_id
        where i.token_hash = p_token_hash and i.status = 'pending' and i.expires_at > now()
            and p.account_status = 'active' and p.auth_user_id is null;
    return coalesce(v, jsonb_build_object('usable', false));
end $$;

create function public.accept_invitation(p_token_hash text, p_auth_user_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare v_profile uuid; p public.profiles%rowtype; i public.invitations%rowtype; v_auth_email text;
begin
    if current_setting('transaction_isolation') <> 'read committed' then
        raise exception 'Commands require READ COMMITTED isolation' using errcode = '25000';
    end if;
    if p_auth_user_id is null then raise exception 'Auth user required' using errcode = '22023'; end if;
    select profile_id into v_profile from public.invitations where token_hash = p_token_hash;
    if not found then raise exception 'Invitation is not usable' using errcode = '22023'; end if;
    select * into p from public.profiles where id = v_profile for update;
    select * into i from public.invitations where token_hash = p_token_hash for update;
    -- A retry after a lost success response must succeed, not report an error.
    if i.status = 'accepted' and p.auth_user_id = p_auth_user_id then
        return jsonb_build_object('profile_id', p.id, 'accepted_at', i.accepted_at, 'replayed', true);
    end if;
    if i.status <> 'pending' or i.expires_at <= now() or p.account_status <> 'active' or p.auth_user_id is not null then
        raise exception 'Invitation is not usable' using errcode = '22023';
    end if;
    select lower(email) into v_auth_email from auth.users where id = p_auth_user_id;
    if v_auth_email is distinct from lower(btrim(i.email)) then
        raise exception 'Sign-in account does not match the invitation' using errcode = '22023';
    end if;
    update public.profiles set auth_user_id = p_auth_user_id, updated_at = now() where id = p.id;
    update public.invitations set status = 'accepted', accepted_at = now() where id = i.id;
    return jsonb_build_object('profile_id', p.id, 'accepted_at', now(), 'replayed', false);
end $$;

-- ACL: same rules as florence_commands. f_cmd_* helpers are never granted.
do $acl$
declare f record;
begin
    for f in select p.oid::regprocedure signature, p.proname from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
        and p.proname = any(array[
            'f_cmd_platform_admin','f_cmd_email','f_cmd_email_free','f_cmd_token','f_cmd_names',
            'f_cmd_faculty_target','f_cmd_student_target','f_cmd_close_pending_invitation','f_cmd_archive_blockers',
            'provision_faculty','update_faculty_identity','change_faculty_assignments','faculty_archive_preview',
            'archive_faculty','grant_executive','replace_executive','remove_executive',
            'cancel_invitation','reissue_invitation','check_invitation','accept_invitation']) loop
        execute format('alter function %s set TimeZone = %L', f.signature, 'UTC');
        execute format('revoke all on function %s from public, anon, authenticated, service_role', f.signature);
        if left(f.proname, 6) <> 'f_cmd_' then
            execute format('grant execute on function %s to service_role', f.signature);
        end if;
    end loop;
end $acl$;

commit;
