-- FL-029 / T-041: display names for disciplinary records without broadening profile RLS.
-- own_profile hides every other profile, so embedded profile joins on disciplinary rows
-- return null. This projection returns names only for people referenced by a disciplinary
-- row the caller can already read; the visibility predicates mirror demerits_read,
-- merits_read, credits_read and endorsements_read. University numbers are returned only
-- for the student on such a row, never for staff actors.
begin;

-- shortcut: scans each caller-visible ledger table per call; add per-column indexes if the ledger grows large.
create function public.florence_discipline_names(p_ids uuid[])
returns table(id uuid, university_id text, first_name text, middle_name text, last_name text, suffix text)
language sql stable security definer set search_path = pg_catalog as $$
    with a as (
        select f_access_private.me() as me, f_access_private.coordinator() as co,
            f_access_private.council() as cu, f_access_private.faculty() as fa
    ), v(id, is_student) as (
        select x.id, x.s from public.demerits d cross join a
        cross join lateral (values (d.student_id, true), (d.issued_by, false), (d.waived_by, false)) x(id, s)
        where a.me is not null and x.id = any(p_ids)
          and (d.student_id = a.me or a.co or (d.source = 'council' and a.cu) or (d.issued_by = a.me and a.fa))
        union all
        select x.id, x.s from public.merits m cross join a
        cross join lateral (values (m.student_id, true), (m.awarded_by, false)) x(id, s)
        where a.me is not null and x.id = any(p_ids)
          and (m.student_id = a.me or a.co or (m.source = 'endorsement' and a.cu) or (m.awarded_by = a.me and a.fa))
        union all
        select x.id, x.s from public.service_credits c cross join a
        cross join lateral (values (c.student_id, true), (c.issued_by, false), (c.revoked_by, false)) x(id, s)
        where a.me is not null and x.id = any(p_ids)
          and (c.student_id = a.me or a.co or (c.issued_by = a.me and a.fa))
        union all
        select x.id, x.s from public.merit_endorsements e cross join a
        cross join lateral (values (e.student_id, true), (e.assigned_instructor_id, false),
            (e.submitted_by, false), (e.decided_by, false)) x(id, s)
        where a.me is not null and x.id = any(p_ids)
          and (e.student_id = a.me or a.cu or a.co or (e.assigned_instructor_id = a.me and a.fa))
    )
    select p.id, case when bool_or(v.is_student) then p.university_id end,
        p.first_name, p.middle_name, p.last_name, p.suffix
    from v join public.profiles p on p.id = v.id
    group by p.id
$$;

revoke all on function public.florence_discipline_names(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.florence_discipline_names(uuid[]) to authenticated;

-- Students may read catalog labels referenced by their own demerits (catalog stays hidden otherwise).
alter policy catalog_read on public.misconduct_catalog using (
  (select f_access_private.faculty())
  or (select f_access_private.has_role('Platform Admin'))
  or exists (select 1 from public.demerits d
    where d.misconduct_id = misconduct_catalog.id and d.student_id = (select f_access_private.me())));

commit;
