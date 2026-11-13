-- FL-009 / T-019: Expand florence_roster read access to Faculty (Instructors and Coordinators).
-- Council Executive/Operations and Faculty can search and view enrolled students.
-- Council Representatives remain denied.

create or replace function public.florence_roster(p_semester uuid)
returns table(enrollment_id uuid, student_id uuid, semester_id uuid, university_id text, first_name text,
    middle_name text, last_name text, suffix text, email text, year_level smallint,
    academic_status public.academic_status, account_status text, has_account boolean)
language plpgsql stable security definer set search_path = pg_catalog as $$
begin
    if not (f_access_private.council() or f_access_private.faculty()) then
        raise exception 'Directory access denied' using errcode = '42501';
    end if;
    return query
    select n.id, p.id, n.semester_id, p.university_id, p.first_name, p.middle_name, p.last_name, p.suffix, p.email,
        n.year_level, n.academic_status, p.account_status, p.auth_user_id is not null
    from public.enrollments n join public.profiles p on p.id = n.student_id
    where n.semester_id = p_semester
    order by n.year_level, p.last_name, p.first_name, p.id;
end $$;

revoke all on function public.florence_roster(uuid) from public, anon, authenticated, service_role;
grant execute on function public.florence_roster(uuid) to authenticated;
