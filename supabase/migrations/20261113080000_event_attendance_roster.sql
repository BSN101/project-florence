-- Event attendee list (FL-017 capture support). Executive/Operations see any
-- published event; Representatives only events still open to capture (published,
-- unarchived, unlocked), replacing their search-only lookup for those events.
-- The live status uses the same outcome helper as consequence generation.
begin;

create function public.florence_event_attendance(p_event uuid)
returns table(student_id uuid, university_id text, first_name text, last_name text,
    year_level smallint, academic_status public.academic_status,
    time_in timestamptz, time_in_method text, time_in_recorded_by text,
    time_out timestamptz, time_out_method text, time_out_recorded_by text, status text)
language plpgsql stable security definer set search_path = pg_catalog as $$
declare e public.events%rowtype; r public.event_consequence_rules%rowtype; v_closed boolean;
begin
    select * into e from public.events where id = p_event;
    if not found then raise exception 'Event not found' using errcode = '22023'; end if;
    if not (f_access_private.council() or (f_access_private.council(true)
        and e.archived_at is null and e.attendance_locked_at is null)) then
        raise exception 'Attendance access denied' using errcode = '42501';
    end if;
    if e.audience_frozen_at is null then raise exception 'Event is not published' using errcode = '55000'; end if;
    select * into r from public.event_consequence_rules where event_id = e.id;
    if not found then raise exception 'Event rules are missing' using errcode = '55000'; end if;
    v_closed := e.attendance_locked_at is not null
        or clock_timestamp() >= greatest(e.ends_at, e.time_in_until, e.time_out_until);

    -- Open: not_in / on_time / late. Closed: absent and missing_time_out come from
    -- the generation rule, so the list matches what generation creates.
    return query
        select p.id, p.university_id, p.first_name, p.last_name,
            a.year_level_snapshot, a.academic_status_snapshot,
            a.time_in, a.time_in_method, nullif(concat_ws(', ', ri.last_name, ri.first_name), ''),
            a.time_out, a.time_out_method, nullif(concat_ws(', ', ro.last_name, ro.first_name), ''),
            case
                when a.time_in is null then case when v_closed then 'absent' else 'not_in' end
                when v_closed and public.f_cmd_event_outcome(a.time_in, a.time_out, e, r) = 'absence'
                    then 'missing_time_out'
                when a.time_in > e.time_in_from + make_interval(mins => e.late_after_minutes) then 'late'
                else 'on_time'
            end
        from public.event_attendance a
        join public.profiles p on p.id = a.student_id
        left join public.profiles ri on ri.id = a.time_in_recorded_by
        left join public.profiles ro on ro.id = a.time_out_recorded_by
        where a.event_id = e.id
        order by p.last_name, p.first_name, p.id;
end $$;

revoke all on function public.florence_event_attendance(uuid) from public, anon, authenticated, service_role;
grant execute on function public.florence_event_attendance(uuid) to authenticated;

commit;
