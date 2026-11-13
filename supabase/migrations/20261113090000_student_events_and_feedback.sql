-- T-025 (FL-015): a student's own events with attendance, status and consequences.
-- T-029 (FL-019): identified, final post-event feedback; Executive/Operations read it.
-- Feedback window: opens when attendance closes and stays open 7 days. Only
-- participants who timed in may respond. One response per student/event (the
-- existing unique key); event_feedback is already append-only.
begin;

-- When capture ends for an event: the latest of the event end and both windows.
create function public.f_cmd_event_closes(e public.events) returns timestamptz
language sql immutable set search_path = pg_catalog as $$
    select greatest(e.ends_at, e.time_in_until, e.time_out_until)
$$;

-- Own events only (preserved participant rows). Archived events stay visible once
-- generated, because their consequences remain on the student's record.
create function public.florence_my_events(p_semester uuid)
returns table(event_id uuid, name text, venue text, time_in_from timestamptz, time_in_until timestamptz,
    time_out_from timestamptz, time_out_until timestamptz, late_after_minutes integer,
    attendance_locked_at timestamptz, consequence_bucket public.bucket,
    time_in timestamptz, time_out timestamptz, status text,
    fine_amount numeric, fine_waived boolean, demerit_days integer,
    feedback_opens_at timestamptz, feedback_closes_at timestamptz, feedback_eligible boolean,
    feedback_submitted_at timestamptz)
language plpgsql stable security definer set search_path = pg_catalog as $$
declare v_me uuid := f_access_private.me();
begin
    if v_me is null then raise exception 'Sign-in required' using errcode = '42501'; end if;
    return query
        select e.id, e.name, e.venue, e.time_in_from, e.time_in_until, e.time_out_from, e.time_out_until,
            e.late_after_minutes, e.attendance_locked_at, e.consequence_bucket, a.time_in, a.time_out,
            -- Same statuses as florence_event_attendance.
            case
                when a.time_in is null then case when x.closed then 'absent' else 'not_in' end
                when x.closed and public.f_cmd_event_outcome(a.time_in, a.time_out, e, r) = 'absence'
                    then 'missing_time_out'
                when a.time_in > e.time_in_from + make_interval(mins => e.late_after_minutes) then 'late'
                else 'on_time'
            end,
            o.amount, o.waived_at is not null,
            (select count(*)::integer from public.demerits d
                where d.event_attendance_id = a.id and d.waived_at is null),
            x.closes, x.closes + interval '7 days', a.time_in is not null, f.submitted_at
        from public.event_attendance a
        join public.events e on e.id = a.event_id
        join public.event_consequence_rules r on r.event_id = e.id
        cross join lateral (select public.f_cmd_event_closes(e) as closes,
            e.attendance_locked_at is not null or clock_timestamp() >= public.f_cmd_event_closes(e) as closed) x
        left join public.obligations o on o.event_attendance_id = a.id and o.kind = 'fine'
        left join public.event_feedback f on f.event_id = e.id and f.student_id = a.student_id
        where a.student_id = v_me and e.semester_id = p_semester and e.audience_frozen_at is not null
            and (e.archived_at is null or e.attendance_locked_at is not null)
        order by e.time_in_from desc, e.id;
end $$;

-- Fixed questionnaire v1: q1..q5 whole numbers 1-5, optional comment up to 1000 chars.
create function public.submit_event_feedback(p_key uuid, p_actor uuid, p_event uuid, p_responses jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare e public.events%rowtype; a public.event_attendance%rowtype; v_result jsonb; v_closes timestamptz;
    v_now timestamptz := clock_timestamp(); v_id uuid;
begin
    if p_event is null or jsonb_typeof(p_responses) is distinct from 'object'
        or (p_responses - array['version','q1','q2','q3','q4','q5','comment']::text[]) <> '{}'::jsonb
        or p_responses->'version' is distinct from '1'::jsonb
        or exists (select 1 from unnest(array['q1','q2','q3','q4','q5']) k
            where case when jsonb_typeof(p_responses->k) = 'number'
                then (p_responses->>k)::numeric not in (1, 2, 3, 4, 5) else true end)
        or (p_responses ? 'comment' and (jsonb_typeof(p_responses->'comment') <> 'string'
            or length(p_responses->>'comment') > 1000)) then
        raise exception 'Answer every question with a rating from 1 to 5' using errcode = '22023';
    end if;
    v_result := public.f_cmd_begin(p_key, 'submit_event_feedback', p_actor,
        jsonb_build_object('event', p_event, 'responses', p_responses));
    if v_result is not null then return v_result; end if;

    select * into e from public.events where id = p_event;
    if not found or e.audience_frozen_at is null then raise exception 'Event not found' using errcode = '22023'; end if;
    if e.archived_at is not null then raise exception 'Event is archived' using errcode = '55000'; end if;
    select * into a from public.event_attendance where event_id = e.id and student_id = p_actor;
    if not found then raise exception 'You are not a participant of this event' using errcode = '42501'; end if;
    if a.time_in is null then
        raise exception 'Only participants who attended can give feedback' using errcode = '42501';
    end if;
    v_closes := public.f_cmd_event_closes(e);
    if v_now < v_closes then raise exception 'Feedback opens when attendance closes' using errcode = '55000'; end if;
    if v_now > v_closes + interval '7 days' then raise exception 'The feedback period has ended' using errcode = '55000'; end if;

    begin
        insert into public.event_feedback(event_id, student_id, responses, submitted_at)
            values (e.id, p_actor, p_responses, now()) returning id into v_id;
    exception when unique_violation then
        raise exception 'Feedback already submitted' using errcode = '23505';
    end;
    return public.f_cmd_finish(p_key, jsonb_build_object('feedback_id', v_id, 'event_id', e.id, 'submitted_at', now()));
end $$;

-- Identified responses for Executive/Operations only (profiles RLS hides other names).
create function public.florence_event_feedback(p_event uuid)
returns table(student_id uuid, university_id text, first_name text, last_name text,
    responses jsonb, submitted_at timestamptz)
language plpgsql stable security definer set search_path = pg_catalog as $$
begin
    if not f_access_private.council() then raise exception 'Feedback access denied' using errcode = '42501'; end if;
    return query
        select p.id, p.university_id, p.first_name, p.last_name, f.responses, f.submitted_at
        from public.event_feedback f join public.profiles p on p.id = f.student_id
        where f.event_id = p_event
        order by f.submitted_at desc, p.id;
end $$;

revoke all on function public.f_cmd_event_closes(public.events) from public, anon, authenticated, service_role;
revoke all on function public.florence_my_events(uuid) from public, anon, authenticated, service_role;
grant execute on function public.florence_my_events(uuid) to authenticated;
revoke all on function public.submit_event_feedback(uuid, uuid, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.submit_event_feedback(uuid, uuid, uuid, jsonb) to service_role;
revoke all on function public.florence_event_feedback(uuid) from public, anon, authenticated, service_role;
grant execute on function public.florence_event_feedback(uuid) to authenticated;

commit;
