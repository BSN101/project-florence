-- T-024/T-026: event configuration and single-student manual attendance capture.
-- Both commands are service_role-only; the server resolves p_actor from a verified
-- session. Existing freeze/parent-guard triggers remain the integrity backstop.
begin;

-- Event and its consequence rules change together in one transaction. After
-- publication (audience_frozen_at) only descriptive fields (name/venue) change.
create function public.save_event(
    p_actor uuid,
    p_event uuid,
    p_semester uuid,
    p_name text,
    p_venue text,
    p_starts_at timestamptz,
    p_ends_at timestamptz,
    p_time_in_from timestamptz,
    p_time_in_until timestamptz,
    p_time_out_from timestamptz,
    p_time_out_until timestamptz,
    p_late_after_minutes integer,
    p_year_levels smallint[],
    p_academic_statuses text[],
    p_absence_fine uuid,
    p_late_fine uuid,
    p_absence_demerit_days integer,
    p_late_demerit_days integer,
    p_requires_time_out boolean
) returns uuid
language plpgsql security definer set search_path = pg_catalog as $$
declare e public.events%rowtype; v_id uuid;
begin
    perform public.f_cmd_council(p_actor);
    if p_requires_time_out is null or (p_requires_time_out and p_time_out_from is null) then
        raise exception 'A time-out window is required when time-out is required' using errcode = '22023';
    end if;
    if p_time_in_from is null then
        raise exception 'A time-in window is required' using errcode = '22023';
    end if;
    -- Lock definitions in UUID order, matching f_cmd_freeze_event.
    perform 1 from public.fine_definitions where id in (p_absence_fine, p_late_fine) order by id for share;
    if (p_absence_fine is not null and not exists (select 1 from public.fine_definitions
            where id = p_absence_fine and archived_at is null))
        or (p_late_fine is not null and not exists (select 1 from public.fine_definitions
            where id = p_late_fine and archived_at is null)) then
        raise exception 'Selected fine definition is unavailable' using errcode = '22023';
    end if;

    if p_event is null then
        insert into public.events(semester_id, name, venue, starts_at, ends_at,
            time_in_from, time_in_until, time_out_from, time_out_until, late_after_minutes,
            year_levels, academic_statuses, created_by, updated_at)
        values (p_semester, p_name, p_venue, p_starts_at, p_ends_at,
            p_time_in_from, p_time_in_until, p_time_out_from, p_time_out_until, p_late_after_minutes,
            p_year_levels, p_academic_statuses, p_actor, now())
        returning id into v_id;
        insert into public.event_consequence_rules(event_id, absence_fine_definition_id,
            late_fine_definition_id, absence_demerit_days, late_demerit_days,
            requires_time_in, requires_time_out)
        values (v_id, p_absence_fine, p_late_fine, p_absence_demerit_days, p_late_demerit_days,
            true, p_requires_time_out);
        return v_id;
    end if;

    select * into e from public.events where id = p_event for update;
    if not found then raise exception 'Event not found' using errcode = '22023'; end if;
    if e.archived_at is not null then raise exception 'Archived events cannot be edited' using errcode = '55000'; end if;
    if e.audience_frozen_at is not null then
        update public.events set name = p_name, venue = p_venue, updated_at = now() where id = e.id;
        return e.id;
    end if;
    -- Semester is event identity and cannot change; p_semester is ignored on update.
    update public.events set name = p_name, venue = p_venue, starts_at = p_starts_at, ends_at = p_ends_at,
        time_in_from = p_time_in_from, time_in_until = p_time_in_until,
        time_out_from = p_time_out_from, time_out_until = p_time_out_until,
        late_after_minutes = p_late_after_minutes, year_levels = p_year_levels,
        academic_statuses = p_academic_statuses, updated_at = now()
        where id = e.id;
    update public.event_consequence_rules set absence_fine_definition_id = p_absence_fine,
        late_fine_definition_id = p_late_fine, absence_demerit_days = p_absence_demerit_days,
        late_demerit_days = p_late_demerit_days, requires_time_out = p_requires_time_out
        where event_id = e.id;
    if not found then raise exception 'Event rules are missing' using errcode = '55000'; end if;
    return e.id;
end $$;

-- Records one side (time-in or time-out) at the database clock. Only that side's
-- time/method/recorder change, so the other side's attribution is preserved.
-- Duplicates are rejected; corrections are not part of this command.
create function public.record_event_attendance(p_key uuid, p_actor uuid, p_event uuid,
    p_student uuid, p_kind text) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare e public.events%rowtype; a public.event_attendance%rowtype; v_now timestamptz; v_result jsonb;
begin
    perform public.f_cmd_council(p_actor, true);
    if p_kind is null or p_kind not in ('time_in', 'time_out') or p_event is null or p_student is null then
        raise exception 'Invalid attendance request' using errcode = '22023';
    end if;
    v_result := public.f_cmd_begin(p_key, 'record_event_attendance', p_actor,
        jsonb_build_object('event', p_event, 'student', p_student, 'kind', p_kind));
    if v_result is not null then return v_result; end if;

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
        update public.event_attendance set time_in = v_now, time_in_method = 'manual',
            time_in_recorded_by = p_actor, updated_at = now() where id = a.id;
    else
        if a.time_in is null then raise exception 'Time-in not recorded' using errcode = '22023'; end if;
        if a.time_out is not null then raise exception 'Time-out already recorded' using errcode = '23505'; end if;
        if e.time_out_from is null or not (v_now between e.time_out_from and e.time_out_until) then
            raise exception 'Outside the time-out window' using errcode = '22023'; end if;
        update public.event_attendance set time_out = v_now, time_out_method = 'manual',
            time_out_recorded_by = p_actor, updated_at = now() where id = a.id;
    end if;

    return public.f_cmd_finish(p_key, jsonb_build_object('event_id', e.id,
        'student_id', p_student, 'kind', p_kind, 'recorded_at', v_now));
end $$;

revoke all on function public.save_event(uuid, uuid, uuid, text, text, timestamptz, timestamptz,
    timestamptz, timestamptz, timestamptz, timestamptz, integer, smallint[], text[], uuid, uuid,
    integer, integer, boolean) from public, anon, authenticated, service_role;
grant execute on function public.save_event(uuid, uuid, uuid, text, text, timestamptz, timestamptz,
    timestamptz, timestamptz, timestamptz, timestamptz, integer, smallint[], text[], uuid, uuid,
    integer, integer, boolean) to service_role;
revoke all on function public.record_event_attendance(uuid, uuid, uuid, uuid, text)
    from public, anon, authenticated, service_role;
grant execute on function public.record_event_attendance(uuid, uuid, uuid, uuid, text) to service_role;

commit;
