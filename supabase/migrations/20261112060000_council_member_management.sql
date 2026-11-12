-- FL-010: Executives manage Operations and Representative Council access.
-- Executive access stays with Platform Admin (grant/replace/remove_executive).
-- Each change sends the student an in-app notice in the same transaction (FL-044).
begin;

-- Same as 20261112020237, plus the council_access_changed notification kind.
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
  if new.kind not in ('merit_received','demerit_incurred','service_recorded','obligation_due','payment_verified','payment_rejected','council_access_changed')
   or new.target_type is not null then raise exception 'Unapproved notification category/navigation'; end if;
 end if;
 return new;
end $$;

-- Private helpers (never granted) ----------------------------------------------

-- Locks the student, then their current membership. Executive targets are
-- refused, which also blocks an Executive from changing their own access.
create function public.f_cmd_council_target(p_membership uuid) returns public.council_memberships
language plpgsql security definer set search_path = pg_catalog as $$
declare v_profile uuid; m public.council_memberships%rowtype;
begin
    select profile_id into v_profile from public.council_memberships where id = p_membership;
    perform public.f_cmd_student_target(v_profile);
    select * into m from public.council_memberships where id = p_membership for update;
    if not found or m.removed_at is not null then
        raise exception 'This Council membership is no longer current' using errcode = '55000';
    end if;
    if m.access_role = 'executive' then
        raise exception 'Executive changes belong to Platform Admin' using errcode = '55000';
    end if;
    return m;
end $$;

create function public.f_cmd_council_role(p_role text, p_label text) returns void
language plpgsql security definer set search_path = pg_catalog as $$
begin
    if p_role is null or p_role not in ('operations', 'representative') then
        raise exception 'Operations or Representative required' using errcode = '22023';
    end if;
    if nullif(btrim(p_label), '') is null then raise exception 'Position label required' using errcode = '22023'; end if;
end $$;

-- Short, non-sensitive notice; it never names the Executive who made the change.
create function public.f_cmd_council_notice(p_student uuid, p_message text) returns void
language plpgsql security definer set search_path = pg_catalog as $$
begin
    insert into public.notifications(recipient_id, kind, message) values (p_student, 'council_access_changed', p_message);
end $$;

-- Commands (service_role only) --------------------------------------------------

create function public.council_add_member(p_key uuid, p_actor uuid, p_university_id text, p_role text, p_label text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_result jsonb; v_profile uuid; p public.profiles%rowtype; m public.council_memberships%rowtype; v_id uuid;
begin
    perform public.f_cmd_council(p_actor, false, true);
    if p_university_id is null or p_university_id !~ '^[0-9]{2}-1-[0-9]{5}$' then
        raise exception 'Exact university number required' using errcode = '22023';
    end if;
    perform public.f_cmd_council_role(p_role, p_label);
    v_result := public.f_cmd_begin(p_key, 'council_add_member', p_actor, jsonb_build_object(
        'university_id', p_university_id, 'role', p_role, 'label', btrim(p_label)));
    if v_result is not null then return v_result || jsonb_build_object('replayed', true); end if;
    select id into v_profile from public.profiles where university_id = p_university_id;
    p := public.f_cmd_student_target(v_profile);
    if p.account_status <> 'active' then
        raise exception 'Archived students cannot receive Council access' using errcode = '55000';
    end if;
    if not exists (select 1 from public.enrollments where student_id = p.id and semester_id = public.f_cmd_current_semester()) then
        raise exception 'Only students enrolled in the current semester can receive Council access' using errcode = '55000';
    end if;
    select * into m from public.council_memberships where profile_id = p.id and removed_at is null for update;
    if m.access_role = 'executive' then raise exception 'Executive changes belong to Platform Admin' using errcode = '55000'; end if;
    if m.id is not null then
        raise exception 'This student already has Council access; change it from the members list' using errcode = '55000';
    end if;
    insert into public.council_memberships (profile_id, access_role, position_label, assigned_by, assigned_at)
        values (p.id, p_role::public.council_access_role, btrim(p_label), p_actor, now()) returning id into v_id;
    perform public.f_cmd_council_notice(p.id, format('You were given Council %s access (%s).', initcap(p_role), btrim(p_label)));
    return public.f_cmd_finish(p_key, jsonb_build_object('profile_id', p.id, 'membership_id', v_id, 'replayed', false));
end $$;

-- Ends the current row and inserts a new one, so history keeps each assignment.
create function public.council_change_member(p_key uuid, p_actor uuid, p_membership uuid, p_role text, p_label text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_result jsonb; m public.council_memberships%rowtype; v_id uuid;
begin
    perform public.f_cmd_council(p_actor, false, true);
    perform public.f_cmd_council_role(p_role, p_label);
    v_result := public.f_cmd_begin(p_key, 'council_change_member', p_actor, jsonb_build_object(
        'membership', p_membership, 'role', p_role, 'label', btrim(p_label)));
    if v_result is not null then return v_result || jsonb_build_object('replayed', true); end if;
    m := public.f_cmd_council_target(p_membership);
    if m.access_role::text = p_role and m.position_label = btrim(p_label) then
        return public.f_cmd_finish(p_key, jsonb_build_object('profile_id', m.profile_id, 'membership_id', m.id,
            'changed', false, 'replayed', false));
    end if;
    if exists (select 1 from public.profiles where id = m.profile_id and account_status <> 'active') then
        raise exception 'Archived students cannot receive Council access' using errcode = '55000';
    end if;
    update public.council_memberships set removed_by = p_actor, removed_at = now() where id = m.id;
    insert into public.council_memberships (profile_id, access_role, position_label, assigned_by, assigned_at)
        values (m.profile_id, p_role::public.council_access_role, btrim(p_label), p_actor, now()) returning id into v_id;
    perform public.f_cmd_council_notice(m.profile_id, format('Your Council access changed to %s (%s).', initcap(p_role), btrim(p_label)));
    return public.f_cmd_finish(p_key, jsonb_build_object('profile_id', m.profile_id, 'membership_id', v_id,
        'changed', true, 'replayed', false));
end $$;

create function public.council_remove_member(p_key uuid, p_actor uuid, p_membership uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_result jsonb; m public.council_memberships%rowtype;
begin
    perform public.f_cmd_council(p_actor, false, true);
    v_result := public.f_cmd_begin(p_key, 'council_remove_member', p_actor, jsonb_build_object('membership', p_membership));
    if v_result is not null then return v_result || jsonb_build_object('replayed', true); end if;
    m := public.f_cmd_council_target(p_membership);
    update public.council_memberships set removed_by = p_actor, removed_at = now() where id = m.id;
    perform public.f_cmd_council_notice(m.profile_id, 'Your Council access was removed.');
    return public.f_cmd_finish(p_key, jsonb_build_object('profile_id', m.profile_id, 'membership_id', m.id, 'replayed', false));
end $$;

-- Reads (authenticated, Executive-guarded) -------------------------------------
-- memberships_read already lets Executives read memberships, but own_profile
-- hides other students' names, so the list needs a restricted read function.

create function public.florence_council_members()
returns table(membership_id uuid, profile_id uuid, university_id text, first_name text, middle_name text,
    last_name text, suffix text, account_status text, access_role public.council_access_role,
    position_label text, assigned_at timestamptz, assigned_by_name text)
language plpgsql stable security definer set search_path = pg_catalog as $$
begin
    if not f_access_private.executive() then
        raise exception 'Council member list denied' using errcode = '42501';
    end if;
    return query
    select m.id, p.id, p.university_id, p.first_name, p.middle_name, p.last_name, p.suffix, p.account_status,
        m.access_role, m.position_label, m.assigned_at, nullif(concat_ws(' ', a.first_name, a.last_name), '')
    from public.council_memberships m
    join public.profiles p on p.id = m.profile_id
    left join public.profiles a on a.id = m.assigned_by
    where m.removed_at is null
    order by m.access_role, p.last_name, p.first_name, p.id;
end $$;

-- Same shape as florence_executive_candidate: one student by exact number.
create function public.florence_council_candidate(p_university_id text)
returns table(id uuid, university_id text, first_name text, middle_name text, last_name text, suffix text,
    account_status text, year_level smallint, academic_status public.academic_status,
    enrollment_year_start integer, enrollment_term text, enrollment_is_current boolean,
    council_role public.council_access_role, position_label text)
language plpgsql stable security definer set search_path = pg_catalog as $$
begin
    if not f_access_private.executive() then
        raise exception 'Council member lookup denied' using errcode = '42501';
    end if;
    if p_university_id is null or p_university_id !~ '^[0-9]{2}-1-[0-9]{5}$' then
        raise exception 'Exact university number required' using errcode = '22023';
    end if;
    return query
    select p.id, p.university_id, p.first_name, p.middle_name, p.last_name, p.suffix, p.account_status,
        e.year_level, e.academic_status, e.academic_year_start, e.term, e.is_current,
        m.access_role, m.position_label
    from public.profiles p
    join lateral (select n.year_level, n.academic_status, s.academic_year_start, s.term, s.is_current
        from public.enrollments n join public.semesters s on s.id = n.semester_id
        where n.student_id = p.id order by s.is_current desc, s.starts_on desc limit 1) e on true
    left join public.council_memberships m on m.profile_id = p.id and m.removed_at is null
    where p.university_id = p_university_id;
end $$;

do $acl$
declare f record;
begin
    for f in select p.oid::regprocedure::text as signature, p.proname from pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.proname = any(array[
            'f_cmd_council_target','f_cmd_council_role','f_cmd_council_notice',
            'council_add_member','council_change_member','council_remove_member']) loop
        execute format('alter function %s set TimeZone = %L', f.signature, 'UTC');
        execute format('revoke all on function %s from public, anon, authenticated, service_role', f.signature);
        if left(f.proname, 6) <> 'f_cmd_' then
            execute format('grant execute on function %s to service_role', f.signature);
        end if;
    end loop;
end $acl$;
revoke all on function public.florence_council_members() from public, anon, authenticated, service_role;
grant execute on function public.florence_council_members() to authenticated;
revoke all on function public.florence_council_candidate(text) from public, anon, authenticated, service_role;
grant execute on function public.florence_council_candidate(text) to authenticated;

commit;
