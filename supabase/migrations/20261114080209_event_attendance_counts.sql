-- Per-event participant and timed-in counts for the Council event list, grouped in SQL so the
-- API row cap cannot truncate them. Security invoker: attendance_read RLS limits rows as before.
begin;

create function public.florence_event_attendance_counts(p_events uuid[])
returns table (
    event_id uuid,
    participants integer,
    timed_in integer
)
language sql stable security invoker set search_path = pg_catalog as $$
    select a.event_id, count(*)::integer, count(a.time_in)::integer
    from public.event_attendance a
    where a.event_id = any(p_events)
    group by a.event_id;
$$;

revoke all on function public.florence_event_attendance_counts(uuid[])
    from public, anon, authenticated, service_role;
grant execute on function public.florence_event_attendance_counts(uuid[]) to authenticated;

commit;
