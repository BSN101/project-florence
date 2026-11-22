-- FL-041 / FL-042 / T-053: Faculty clearance reads.
-- 1. florence_bucket_balances: per-student cumulative bucket counts for a semester roster,
--    computed in the database so the clearance page no longer downloads every ledger row.
--    SECURITY INVOKER: callers only count rows their RLS already lets them read, so it
--    exposes nothing new. Counts match f_cmd_balance (balance = demerits - applied - credits).
-- 2. florence_clearance_names: display names of the people who confirmed clearances the
--    caller can read (mirrors clearances_read). own_profile hides other profiles, so this
--    restricted projection replaces an embedded profile join. No university numbers.
begin;

-- Lets the per-student credit count use an index like demerits and merit_applications do.
create index service_credits_student_bucket_idx on public.service_credits (student_id, bucket);

create function public.florence_bucket_balances(p_semester uuid, p_bucket public.bucket)
returns table(student_id uuid, active_demerits bigint, applied_merits bigint, active_service_credits bigint)
language sql stable security invoker set search_path = pg_catalog as $$
    select n.student_id,
        (select count(*) from public.demerits d
            where d.student_id = n.student_id and d.bucket = p_bucket and d.waived_at is null),
        (select count(*) from public.merit_applications a
            where a.student_id = n.student_id and a.bucket = p_bucket),
        (select count(*) from public.service_credits c
            where c.student_id = n.student_id and c.bucket = p_bucket and c.revoked_at is null)
    from public.enrollments n
    where n.semester_id = p_semester
$$;

create function public.florence_clearance_names(p_ids uuid[])
returns table(id uuid, first_name text, middle_name text, last_name text, suffix text)
language sql stable security definer set search_path = pg_catalog as $$
    select p.id, p.first_name, p.middle_name, p.last_name, p.suffix
    from public.profiles p
    where p.id = any(p_ids)
      and f_access_private.me() is not null
      and exists (select 1 from public.clearances c
          where c.confirmed_by = p.id
            and (c.student_id = f_access_private.me()
                 or f_access_private.council()
                 or f_access_private.coordinator()))
$$;

revoke all on function public.florence_bucket_balances(uuid, public.bucket) from public, anon, authenticated, service_role;
grant execute on function public.florence_bucket_balances(uuid, public.bucket) to authenticated;
revoke all on function public.florence_clearance_names(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.florence_clearance_names(uuid[]) to authenticated;

commit;
