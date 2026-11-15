-- FL-022: one student's identity for the Council financial ledger, without loading whole rosters.
-- Executive/Operations only (council() excludes Representatives); profiles with no enrollment are not students.
begin;

create function public.florence_finance_student(p_student uuid)
returns table(id uuid, university_id text, first_name text, middle_name text, last_name text, suffix text)
language plpgsql stable security definer set search_path = pg_catalog set "TimeZone" = 'UTC' as $$
begin
    if not f_access_private.council() then
        raise exception 'Financial account access denied' using errcode = '42501';
    end if;
    return query
    select p.id, p.university_id, p.first_name, p.middle_name, p.last_name, p.suffix
    from public.profiles p
    where p.id = p_student
      and exists (select 1 from public.enrollments n where n.student_id = p.id);
end $$;

revoke all on function public.florence_finance_student(uuid) from public, anon, authenticated, service_role;
grant execute on function public.florence_finance_student(uuid) to authenticated;

commit;
