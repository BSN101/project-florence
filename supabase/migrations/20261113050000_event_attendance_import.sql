-- T-027: event attendance CSV import (paper fallback). One command validates
-- (p_apply = false, no writes) or applies (p_apply = true, all-or-nothing).
-- Rows match participants by university number inside the database, so callers
-- never need directory access. Already-recorded sides keep their online value.
begin;

create function public.import_event_attendance(p_key uuid, p_actor uuid, p_event uuid,
    p_rows jsonb, p_apply boolean) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare e public.events%rowtype; x record; a record; v_result jsonb;
    v_rows jsonb := '[]'::jsonb; v_issue text; v_note text; v_in timestamptz; v_out timestamptz;
    v_ready integer := 0; v_skipped integer := 0; v_invalid integer := 0; v_now timestamptz := clock_timestamp();
begin
    perform public.f_cmd_council(p_actor, true);
    if p_apply is null or p_event is null or jsonb_typeof(p_rows) is distinct from 'array'
        or jsonb_array_length(p_rows) not between 1 and 10000 then
        raise exception 'Invalid attendance import' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(p_rows) r(v) where jsonb_typeof(v) <> 'object'
        or v - array['row','university_id','time_in','time_out']::text[] <> '{}'::jsonb
        or not (v ?& array['row','university_id','time_in','time_out'])) then
        raise exception 'Invalid attendance import row shape' using errcode = '22023';
    end if;
    if p_apply then
        v_result := public.f_cmd_begin(p_key, 'import_event_attendance', p_actor,
            jsonb_build_object('event', p_event, 'rows', p_rows));
        if v_result is not null then return v_result; end if;
        select * into e from public.events where id = p_event for update;
    else
        select * into e from public.events where id = p_event;
    end if;
    if not found then raise exception 'Event not found' using errcode = '22023'; end if;
    if e.audience_frozen_at is null then raise exception 'Event is not published' using errcode = '55000'; end if;
    if e.archived_at is not null then raise exception 'Event is archived' using errcode = '55000'; end if;
    if e.attendance_locked_at is not null then raise exception 'Event attendance is locked' using errcode = '55000'; end if;

    for x in select t.*, count(*) over (partition by t.university_id) as copies
        from jsonb_to_recordset(p_rows) as t("row" integer, university_id text, time_in timestamptz, time_out timestamptz)
        order by t."row" loop
        v_issue := null; v_note := null; v_in := null; v_out := null;
        select ea.id, ea.student_id, ea.time_in, ea.time_out, p.first_name, p.last_name into a
            from public.event_attendance ea join public.profiles p on p.id = ea.student_id
            where ea.event_id = e.id and p.university_id = x.university_id
            for update of ea;
        if x.copies > 1 then v_issue := 'Student appears more than once in the file';
        elsif a.id is null then v_issue := 'Not a participant of this event';
        elsif a.student_id = p_actor then v_issue := 'You cannot import your own attendance';
        else
            v_in := case when a.time_in is null then x.time_in end;
            v_out := case when a.time_out is null then x.time_out end;
            if v_in is not null and (not (v_in between e.time_in_from and e.time_in_until) or v_in > v_now) then
                v_issue := 'Time-in is outside the event''s capture window';
            elsif v_out is not null and coalesce(a.time_in, v_in) is null then
                v_issue := 'Time-out has no time-in';
            elsif v_out is not null and v_out <= coalesce(a.time_in, v_in) then
                v_issue := 'Time-out must be after time-in';
            elsif v_out is not null and (e.time_out_from is null
                or not (v_out between e.time_out_from and e.time_out_until) or v_out > v_now) then
                v_issue := 'Time-out is outside the event''s capture window';
            end if;
            if x.time_in is not null and a.time_in is not null then v_note := 'Time-in already recorded online; CSV value ignored'; end if;
            if x.time_out is not null and a.time_out is not null then
                v_note := concat_ws('. ', v_note, 'Time-out already recorded online; CSV value ignored'); end if;
            if v_issue is null and v_in is null and v_out is null and v_note is null then v_note := 'No times given'; end if;
        end if;

        if v_issue is not null then v_invalid := v_invalid + 1;
        elsif v_in is null and v_out is null then v_skipped := v_skipped + 1;
        else
            v_ready := v_ready + 1;
            if p_apply then
                update public.event_attendance set
                    time_in = coalesce(v_in, time_in),
                    time_in_method = case when v_in is not null then 'csv' else time_in_method end,
                    time_in_recorded_by = case when v_in is not null then p_actor else time_in_recorded_by end,
                    time_out = coalesce(v_out, time_out),
                    time_out_method = case when v_out is not null then 'csv' else time_out_method end,
                    time_out_recorded_by = case when v_out is not null then p_actor else time_out_recorded_by end,
                    updated_at = now()
                    where id = a.id;
            end if;
        end if;
        if not p_apply then
            v_rows := v_rows || jsonb_build_object('row', x."row", 'university_id', x.university_id,
                'name', case when a.id is not null then concat_ws(' ', a.first_name, a.last_name) end,
                'status', case when v_issue is not null then 'invalid'
                    when v_in is null and v_out is null then 'skipped' else 'ready' end,
                'message', coalesce(v_issue, v_note));
        end if;
    end loop;

    if not p_apply then
        return jsonb_build_object('event_id', e.id, 'ready', v_ready, 'skipped', v_skipped,
            'invalid', v_invalid, 'rows', v_rows);
    end if;
    if v_invalid > 0 then
        raise exception 'Import has % invalid row(s); preview the file and fix them', v_invalid using errcode = '22023';
    end if;
    return public.f_cmd_finish(p_key, jsonb_build_object('event_id', e.id,
        'recorded', v_ready, 'skipped', v_skipped));
end $$;

revoke all on function public.import_event_attendance(uuid, uuid, uuid, jsonb, boolean)
    from public, anon, authenticated, service_role;
grant execute on function public.import_event_attendance(uuid, uuid, uuid, jsonb, boolean) to service_role;

commit;
