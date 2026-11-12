-- Council access only for students who have activated their Florence account
-- (accepted their invitation), not roster-only profiles.
begin;

-- Same as 20261112060000, plus the linked-account check.
create or replace function public.council_add_member(p_key uuid, p_actor uuid, p_university_id text, p_role text, p_label text)
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
    if p.auth_user_id is null then
        raise exception 'This student has not activated their Florence account yet' using errcode = '55000';
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
-- CREATE OR REPLACE keeps the ACL; restate the command settings explicitly anyway.
alter function public.council_add_member(uuid, uuid, text, text, text) set TimeZone = 'UTC';
revoke all on function public.council_add_member(uuid, uuid, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.council_add_member(uuid, uuid, text, text, text) to service_role;

-- Adds account_linked (never the Auth user id); the return shape changes, so drop and recreate.
drop function public.florence_council_candidate(text);
create function public.florence_council_candidate(p_university_id text)
returns table(id uuid, university_id text, first_name text, middle_name text, last_name text, suffix text,
    account_status text, account_linked boolean, year_level smallint, academic_status public.academic_status,
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
        p.auth_user_id is not null, e.year_level, e.academic_status, e.academic_year_start, e.term, e.is_current,
        m.access_role, m.position_label
    from public.profiles p
    join lateral (select n.year_level, n.academic_status, s.academic_year_start, s.term, s.is_current
        from public.enrollments n join public.semesters s on s.id = n.semester_id
        where n.student_id = p.id order by s.is_current desc, s.starts_on desc limit 1) e on true
    left join public.council_memberships m on m.profile_id = p.id and m.removed_at is null
    where p.university_id = p_university_id;
end $$;
revoke all on function public.florence_council_candidate(text) from public, anon, authenticated, service_role;
grant execute on function public.florence_council_candidate(text) to authenticated;

commit;
