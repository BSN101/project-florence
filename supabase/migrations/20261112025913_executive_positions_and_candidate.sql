-- 1. No two CURRENT Executives may share a position label (trimmed, case-insensitive).
--    Verified 0 duplicates on 2026-11-12. Labels stay descriptive, not authority.
-- 2. Richer exact-number candidate lookup so Platform Admin can confirm the right
--    student before granting. Still one student by exact number, not a roster.
begin;

create unique index council_memberships_executive_position_unique
    on public.council_memberships (lower(btrim(position_label)))
    where removed_at is null and access_role = 'executive';

-- Same as 20261112020237, plus a readable error before the index would fire.
create or replace function public.grant_executive(p_key uuid, p_actor uuid, p_university_id text, p_label text)
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
    if m.id is not null and m.access_role = 'executive' then
        raise exception 'Student already has Executive access' using errcode = '55000';
    end if;
    if exists (select 1 from public.council_memberships c where c.removed_at is null and c.access_role = 'executive'
        and lower(btrim(c.position_label)) = lower(btrim(p_label))) then
        raise exception 'Another current Executive already holds the position "%"', btrim(p_label) using errcode = '55000';
    end if;
    if m.id is not null then
        update public.council_memberships set removed_by = p_actor, removed_at = now() where id = m.id;
    end if;
    insert into public.council_memberships (profile_id, access_role, position_label, assigned_by, assigned_at)
        values (p.id, 'executive', btrim(p_label), p_actor, now()) returning id into v_id;
    return public.f_cmd_finish(p_key, jsonb_build_object('profile_id', p.id, 'membership_id', v_id,
        'replaced_access_role', m.access_role, 'replayed', false));
end $$;
-- CREATE OR REPLACE keeps the ACL; restate the command settings explicitly anyway.
alter function public.grant_executive(uuid, uuid, text, text) set TimeZone = 'UTC';
revoke all on function public.grant_executive(uuid, uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.grant_executive(uuid, uuid, text, text) to service_role;

-- Unused by the app until now; the return shape changes, so drop and recreate.
drop function public.florence_executive_candidate(text);
create function public.florence_executive_candidate(p_university_id text)
returns table(id uuid, university_id text, first_name text, middle_name text, last_name text, suffix text,
    account_status text, year_level smallint, academic_status public.academic_status,
    enrollment_year_start integer, enrollment_term text, enrollment_is_current boolean,
    council_role public.council_access_role, position_label text)
language plpgsql stable security definer set search_path = pg_catalog as $$
begin
    if not f_access_private.has_role('Platform Admin') then
        raise exception 'Executive provisioning lookup denied' using errcode = '42501';
    end if;
    if p_university_id is null or p_university_id !~ '^[0-9]{2}-1-[0-9]{5}$' then
        raise exception 'Exact university number required' using errcode = '22023';
    end if;
    return query
    select p.id, p.university_id, p.first_name, p.middle_name, p.last_name, p.suffix, p.account_status,
        e.year_level, e.academic_status, e.academic_year_start, e.term, e.is_current,
        m.access_role, m.position_label
    from public.profiles p
    -- Current-semester enrollment if any, otherwise the most recent one.
    join lateral (select n.year_level, n.academic_status, s.academic_year_start, s.term, s.is_current
        from public.enrollments n join public.semesters s on s.id = n.semester_id
        where n.student_id = p.id order by s.is_current desc, s.starts_on desc limit 1) e on true
    left join public.council_memberships m on m.profile_id = p.id and m.removed_at is null
    where p.university_id = p_university_id;
end $$;
revoke all on function public.florence_executive_candidate(text) from public, anon, authenticated, service_role;
grant execute on function public.florence_executive_candidate(text) to authenticated;

commit;
