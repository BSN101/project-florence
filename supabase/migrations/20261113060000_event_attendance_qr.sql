-- T-026: QR attendance capture. The QR holds only the university number (FL-012);
-- the database resolves it to the stable profile. Manual and QR capture share one
-- private helper, so eligibility, window and duplicate checks stay identical (FL-017).
begin;

-- Private helper (never granted). Caller has authorized the actor and claimed the key.
create function public.f_cmd_record_attendance(p_actor uuid, p_event uuid, p_student uuid,
    p_kind text, p_method text) returns timestamptz
language plpgsql security definer set search_path = pg_catalog as $$
declare e public.events%rowtype; a public.event_attendance%rowtype; v_now timestamptz;
begin
    select * into e from public.events where id = p_event for update;
    if not found then raise exception 'Event not found' using errcode = '22023'; end if;
    if e.audience_frozen_at is null then raise exception 'Event is not published' using errcode = '55000'; end if;
    if e.archived_at is not null then raise exception 'Event is archived' using errcode = '55000'; end if;
    if e.attendance_locked_at is not null then raise exception 'Event attendance is locked' using errcode = '55000'; end if;
    if p_student = p_actor then raise exception 'Self attendance recording is forbidden' using errcode = '42501'; end if;

    select * into a from public.event_attendance where event_id = e.id and student_id = p_student for update;
    if not found then raise exception 'Student is not in preserved event audience' using errcode = '22023'; end if;
    v_now := clock_timestamp();

    if p_kind = 'time_in' then
        if a.time_in is not null then raise exception 'Time-in already recorded' using errcode = '23505'; end if;
        if not (v_now between e.time_in_from and e.time_in_until) then
            raise exception 'Outside the time-in window' using errcode = '22023'; end if;
        update public.event_attendance set time_in = v_now, time_in_method = p_method,
            time_in_recorded_by = p_actor, updated_at = now() where id = a.id;
    else
        if a.time_in is null then raise exception 'Time-in not recorded' using errcode = '22023'; end if;
        if a.time_out is not null then raise exception 'Time-out already recorded' using errcode = '23505'; end if;
        if e.time_out_from is null or not (v_now between e.time_out_from and e.time_out_until) then
            raise exception 'Outside the time-out window' using errcode = '22023'; end if;
        update public.event_attendance set time_out = v_now, time_out_method = p_method,
            time_out_recorded_by = p_actor, updated_at = now() where id = a.id;
    end if;
    return v_now;
end $$;

-- Same signature and behavior as before; the body now delegates to the shared helper.
create or replace function public.record_event_attendance(p_key uuid, p_actor uuid, p_event uuid,
    p_student uuid, p_kind text) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare v_result jsonb; v_now timestamptz;
begin
    perform public.f_cmd_council(p_actor, true);
    if p_kind is null or p_kind not in ('time_in', 'time_out') or p_event is null or p_student is null then
        raise exception 'Invalid attendance request' using errcode = '22023';
    end if;
    v_result := public.f_cmd_begin(p_key, 'record_event_attendance', p_actor,
        jsonb_build_object('event', p_event, 'student', p_student, 'kind', p_kind));
    if v_result is not null then return v_result; end if;
    v_now := public.f_cmd_record_attendance(p_actor, p_event, p_student, p_kind, 'manual');
    return public.f_cmd_finish(p_key, jsonb_build_object('event_id', p_event,
        'student_id', p_student, 'kind', p_kind, 'recorded_at', v_now));
end $$;

-- Scanned capture. Returns the student's name so the station can confirm who was recorded.
create function public.record_event_attendance_qr(p_key uuid, p_actor uuid, p_event uuid,
    p_university_id text, p_kind text) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare v_result jsonb; v_now timestamptz; p public.profiles%rowtype;
begin
    perform public.f_cmd_council(p_actor, true);
    if p_kind is null or p_kind not in ('time_in', 'time_out') or p_event is null
        or p_university_id is null or p_university_id !~ '^[0-9]{2}-1-[0-9]{5}$' then
        raise exception 'Invalid attendance request' using errcode = '22023';
    end if;
    v_result := public.f_cmd_begin(p_key, 'record_event_attendance_qr', p_actor,
        jsonb_build_object('event', p_event, 'university_id', p_university_id, 'kind', p_kind));
    if v_result is not null then return v_result; end if;
    select * into p from public.profiles where university_id = p_university_id;
    if not found then raise exception 'No student has this university number' using errcode = '22023'; end if;
    v_now := public.f_cmd_record_attendance(p_actor, p_event, p.id, p_kind, 'qr');
    return public.f_cmd_finish(p_key, jsonb_build_object('event_id', p_event,
        'student_id', p.id, 'university_id', p.university_id, 'first_name', p.first_name,
        'last_name', p.last_name, 'kind', p_kind, 'recorded_at', v_now));
end $$;

revoke all on function public.f_cmd_record_attendance(uuid, uuid, uuid, text, text)
    from public, anon, authenticated, service_role;
revoke all on function public.record_event_attendance(uuid, uuid, uuid, uuid, text)
    from public, anon, authenticated, service_role;
grant execute on function public.record_event_attendance(uuid, uuid, uuid, uuid, text) to service_role;
revoke all on function public.record_event_attendance_qr(uuid, uuid, uuid, text, text)
    from public, anon, authenticated, service_role;
grant execute on function public.record_event_attendance_qr(uuid, uuid, uuid, text, text) to service_role;

commit;
