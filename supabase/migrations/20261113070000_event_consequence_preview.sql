-- T-028 (FL-018): consequence preview. The outcome rule moves into one private
-- helper used by both the preview and generation, so what Council reviews is what
-- generation writes. Generation keeps its signature, receipts and locking protocol;
-- it now also refuses archived events that were never generated.
begin;

-- Absence: no time-in, a time-in outside its window, or (when required) a missing or
-- out-of-window time-out. Late: time-in after the time-in opening plus the threshold.
-- Time-in opening is the event's actual start.
create function public.f_cmd_event_outcome(p_time_in timestamptz, p_time_out timestamptz,
    e public.events, r public.event_consequence_rules) returns text
language sql immutable set search_path = pg_catalog as $$
    select case when p_time_in is null or not (p_time_in between e.time_in_from and e.time_in_until)
        or (r.requires_time_out and (p_time_out is null
            or not (p_time_out between e.time_out_from and e.time_out_until))) then 'absence'
        when p_time_in > e.time_in_from + make_interval(mins => e.late_after_minutes) then 'late'
        else null end
$$;

create or replace function public.generate_event_consequences(
    p_key uuid, p_actor uuid, p_event uuid, p_bucket public.bucket)
returns jsonb language plpgsql security definer
set search_path = pg_catalog set TimeZone = 'UTC' as $$
declare e public.events%rowtype; r public.event_consequence_rules%rowtype;
    a public.event_attendance%rowtype; v_result jsonb; v_outcome text; v_days integer;
    v_amount numeric; v_group uuid; v_zone text;
begin
    perform public.f_cmd_council(p_actor);
    if p_key is null or p_event is null or p_bucket is null then
        raise exception 'Explicit request, event and office/rle bucket required' using errcode = '22023';
    end if;
    -- Same request -> event -> sorted balances protocol as 003. Never amend old
    -- payloads just to make them compare equal to a newly invented election.
    perform pg_advisory_xact_lock(hashtextextended('florence:request:' || p_key::text, 0));
    if exists (select 1 from f_cmd_private.requests q where q.request_key = p_key
        and q.command = 'generate_event_consequences' and not (q.payload ? 'bucket')) then
        raise exception 'Legacy bucketless generation receipt requires explicit reconciliation; retained unchanged'
            using errcode = '55000';
    end if;
    v_result := public.f_cmd_begin(p_key, 'generate_event_consequences', p_actor,
        jsonb_build_object('event', p_event, 'bucket', p_bucket));
    -- Even receipt replays lock/recheck the event and its established election.
    select * into e from public.events where id = p_event for update;
    if not found then raise exception 'Event not found' using errcode = '22023'; end if;
    if e.attendance_locked_at is not null and e.consequence_bucket is null then
        raise exception 'Finalized legacy event has unknown bucket; no regeneration or election without reconciliation'
            using errcode = '55000';
    end if;
    if e.consequence_bucket is not null and e.consequence_bucket is distinct from p_bucket then
        raise exception 'Chosen bucket conflicts with established event generation bucket' using errcode = '22023';
    end if;
    if v_result is not null then
        if e.attendance_locked_at is null or e.consequence_bucket is distinct from p_bucket then
            raise exception 'Receipt conflicts with event finalization; reconcile before replay' using errcode = '55000';
        end if;
        return v_result;
    end if;
    if e.attendance_locked_at is null then
        if e.archived_at is not null then
            raise exception 'Archived events cannot generate consequences' using errcode = '55000';
        end if;
        -- A committed open election/partial ledger is not an invitation to
        -- complete or repair history by guessing what a previous writer meant.
        if e.consequence_bucket is not null or exists (
            select 1 from public.demerits d join public.event_attendance ea on ea.id = d.event_attendance_id where ea.event_id = e.id
        ) or exists (
            select 1 from public.obligations o join public.event_attendance ea on ea.id = o.event_attendance_id where ea.event_id = e.id
        ) then raise exception 'Open event has generation facts; reconcile before generation' using errcode = '55000'; end if;
        perform public.f_cmd_freeze_event(p_event);
        select * into e from public.events where id = p_event for update;
        select * into r from public.event_consequence_rules where event_id = e.id;
        if not found then raise exception 'Frozen event has no consequence rules'; end if;
        if clock_timestamp() < greatest(e.ends_at, e.time_in_until, e.time_out_until) then
            raise exception 'Event and capture windows must end before consequence generation'; end if;
        v_zone := public.f_cmd_timezone();
        -- Snapshot BEFORE unit INSERT triggers; finalization follows all units.
        update public.events set consequence_bucket = p_bucket where id = e.id;
        perform pg_advisory_xact_lock(k) from (select distinct public.f_cmd_balance_key(student_id, p_bucket) k
            from public.event_attendance where event_id = e.id) s order by k;
        for a in select * from public.event_attendance where event_id = e.id order by id loop
            v_outcome := public.f_cmd_event_outcome(a.time_in, a.time_out, e, r);
            if v_outcome is null then continue; end if;
            v_days := case v_outcome when 'absence' then r.absence_demerit_days else r.late_demerit_days end;
            v_amount := case v_outcome when 'absence' then r.absence_fine_amount else r.late_fine_amount end;
            if v_amount is not null then
                insert into public.obligations(student_id, semester_id, kind, event_attendance_id,
                    consequence_outcome, description, amount)
                values (a.student_id, e.semester_id, 'fine', a.id, v_outcome, e.name || ': ' || v_outcome, v_amount);
                perform public.f_cmd_notice(a.student_id, 'obligation_due');
            end if;
            if v_days > 0 then
                v_group := gen_random_uuid();
                insert into public.demerits(incident_group_id, incident_unit_index, student_id, semester_id,
                    bucket, source, description, incident_on, event_attendance_id, consequence_outcome, source_unit_index, issued_by)
                select v_group, n, a.student_id, e.semester_id, p_bucket, 'council', e.name || ': ' || v_outcome,
                    (e.starts_at at time zone v_zone)::date, a.id, v_outcome, n, p_actor from generate_series(1, v_days) n;
                perform public.f_cmd_notice(a.student_id, 'demerit_incurred');
            end if;
        end loop;
        update public.events set attendance_locked_at = now(), updated_at = now() where id = e.id
            returning attendance_locked_at into e.attendance_locked_at;
    end if;
    return public.f_cmd_finish(p_key, jsonb_build_object('event_id', e.id, 'bucket', p_bucket, 'locked_at', e.attendance_locked_at,
        'obligation_count', (select count(*) from public.obligations o join public.event_attendance ea on ea.id = o.event_attendance_id where ea.event_id = e.id),
        'demerit_count', (select count(*) from public.demerits d join public.event_attendance ea on ea.id = d.event_attendance_id where ea.event_id = e.id)));
end $$;


-- Read-only projection for Executive/Operations. Also valid after generation: the
-- attendance and rules are frozen then, so it lists exactly what was generated.
create function public.florence_event_consequence_preview(p_event uuid)
returns table(student_id uuid, university_id text, first_name text, last_name text,
    year_level smallint, academic_status public.academic_status, time_in timestamptz,
    time_out timestamptz, outcome text, fine_amount numeric, demerit_days integer)
language plpgsql stable security definer set search_path = pg_catalog as $$
declare e public.events%rowtype; r public.event_consequence_rules%rowtype;
begin
    if not f_access_private.council() then
        raise exception 'Consequence preview access denied' using errcode = '42501';
    end if;
    select * into e from public.events where id = p_event;
    if not found then raise exception 'Event not found' using errcode = '22023'; end if;
    if e.audience_frozen_at is null then raise exception 'Event is not published' using errcode = '55000'; end if;
    select * into r from public.event_consequence_rules where event_id = e.id;
    if not found then raise exception 'Event rules are missing' using errcode = '55000'; end if;
    return query
        select x.student_id, x.university_id, x.first_name, x.last_name, x.year_level, x.academic_status,
            x.time_in, x.time_out, x.outcome,
            case x.outcome when 'absence' then r.absence_fine_amount when 'late' then r.late_fine_amount end,
            case x.outcome when 'absence' then r.absence_demerit_days when 'late' then r.late_demerit_days else 0 end
        from (
            select p.id as student_id, p.university_id, p.first_name, p.last_name,
                a.year_level_snapshot as year_level, a.academic_status_snapshot as academic_status,
                a.time_in, a.time_out, public.f_cmd_event_outcome(a.time_in, a.time_out, e, r) as outcome
            from public.event_attendance a join public.profiles p on p.id = a.student_id
            where a.event_id = e.id
        ) x
        order by x.outcome nulls last, x.last_name, x.first_name, x.student_id;
end $$;

revoke all on function public.f_cmd_event_outcome(timestamptz, timestamptz, public.events, public.event_consequence_rules)
    from public, anon, authenticated, service_role;
revoke all on function public.generate_event_consequences(uuid, uuid, uuid, public.bucket)
    from public, anon, authenticated, service_role;
grant execute on function public.generate_event_consequences(uuid, uuid, uuid, public.bucket) to service_role;
revoke all on function public.florence_event_consequence_preview(uuid)
    from public, anon, authenticated, service_role;
grant execute on function public.florence_event_consequence_preview(uuid) to authenticated;

commit;
