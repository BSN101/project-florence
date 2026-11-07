-- Forward-only correction after applied database/001, 002 and 003.
-- Run as the trusted migration owner, during a coordinated command-write pause.
-- No history/receipt/actor/role rewrite. No CASCADE. This is not a rerunnable seed.
-- App contract: generate_event_consequences(p_key, p_actor, p_event, p_bucket),
-- p_bucket = office/rle, explicitly selected at generation, not publication.
-- Old three-argument calls are intentionally unavailable after this migration.
-- Legacy bucketless request receipts remain byte-for-byte unchanged: reuse fails
-- closed, even when a bucket can be inferred for the event. Reconcile those keys
-- explicitly; a NEW key may read an already-finalized event only if its known
-- snapshot matches. Zero-demerit legacy events remain NULL and cannot regenerate.
-- Do not infer a historic election from current settings, enabled rules, actor,
-- receipt counts, or a caller's newly supplied bucket.
begin;
set local lock_timeout = '10s';
set local search_path = pg_catalog;

-- Lock out old commands/direct writers throughout inspection, snapshot backfill
-- and function replacement. Coordinate the write pause to avoid lock inversion
-- with an in-flight request -> event -> ledger command; timeout rolls back ALL.
lock table f_cmd_private.requests, f_cmd_private.settings, public.events,
    public.event_attendance, public.event_consequence_rules, public.demerits,
    public.obligations in access exclusive mode;

alter table public.events add column consequence_bucket public.bucket;
comment on column public.events.consequence_bucket is
    'Bucket explicitly selected at first consequence generation; immutable thereafter. NULL on finalized legacy events means historically unknown, not a new election opportunity.';

-- Fail before changing facts if no single event-level bucket is provable.
-- Waived units still establish history, so do not filter them out.
do $preflight$
begin
    if exists (
        select 1 from public.demerits d
        join public.event_attendance a on a.id = d.event_attendance_id
        join public.events e on e.id = a.event_id
        where d.source = 'council'
        group by e.id, e.attendance_locked_at, e.audience_frozen_at
        having count(distinct d.bucket) <> 1
            or e.attendance_locked_at is null or e.audience_frozen_at is null
    ) then
        raise exception 'Inconsistent Council event bucket/finalization facts; reconcile before 004'
            using errcode = '55000';
    end if;
    if exists (
        select 1 from public.obligations o
        join public.event_attendance a on a.id = o.event_attendance_id
        join public.events e on e.id = a.event_id
        where e.attendance_locked_at is null
    ) then
        raise exception 'Unfinalized event has generated obligations; reconcile before 004'
            using errcode = '55000';
    end if;
end $preflight$;

-- The OLD generic JSON freeze guard would reject this newly added field.
-- Only that trigger is suspended, only for this provenance-preserving backfill,
-- under ACCESS EXCLUSIVE locks in this atomic migration. No ledger trigger is
-- disabled. Deferred final_consistency still runs against the completed schema.
-- Immediate checks avoid pending deferred events blocking ENABLE TRIGGER.
set constraints all immediate;
alter table public.events disable trigger event_freeze;
update public.events e set consequence_bucket = facts.bucket
from (
    select distinct a.event_id, d.bucket
    from public.demerits d
    join public.event_attendance a on a.id = d.event_attendance_id
    where d.source = 'council'
) facts where e.id = facts.event_id;
alter table public.events enable trigger event_freeze;
set constraints all deferred;

-- Exact replacements below retain the unrelated branches from 002.
create or replace function f_access_private.parent_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare e public.events%rowtype; s public.service_sessions%rowtype;
begin
 if TG_TABLE_NAME='events' then
  if TG_OP='DELETE' then raise exception 'Archive events; do not delete'; end if;
  if new.id<>old.id or new.semester_id<>old.semester_id or new.created_by<>old.created_by or new.created_at<>old.created_at then raise exception 'Event identity is immutable'; end if;
  if old.audience_frozen_at is not null and
   (to_jsonb(new)-array['name','venue','archived_at','attendance_locked_at','consequence_bucket','updated_at']) is distinct from
   (to_jsonb(old)-array['name','venue','archived_at','attendance_locked_at','consequence_bucket','updated_at']) then raise exception 'Published event configuration is frozen'; end if;
  -- Publication does not elect a bucket. Assignment is allowed once, during
  -- open generation. Finalized NULL legacy snapshots are immutable too.
  if new.consequence_bucket is distinct from old.consequence_bucket and
   (old.consequence_bucket is not null or old.attendance_locked_at is not null
    or old.audience_frozen_at is null or new.consequence_bucket is null) then
   raise exception 'Event generation bucket is immutable outside first generation'; end if;
  if old.attendance_locked_at is null and new.attendance_locked_at is not null
   and new.consequence_bucket is null then raise exception 'First generation requires explicit bucket'; end if;
  if old.attendance_locked_at is not null and new.attendance_locked_at is distinct from old.attendance_locked_at then raise exception 'Attendance lock is permanent'; end if;
 elsif TG_TABLE_NAME in ('event_attendance','event_consequence_rules') then
  select * into e from public.events where id=coalesce(new.event_id,old.event_id) for update;
  if TG_OP='DELETE' then raise exception 'Event child history cannot be deleted'; end if;
  if TG_OP='UPDATE' and new.event_id<>old.event_id then raise exception 'Event parent cannot change'; end if;
  if TG_TABLE_NAME='event_consequence_rules' then
   if e.audience_frozen_at is not null then raise exception 'Published consequence rules are frozen'; end if;
  else
   if e.attendance_locked_at is not null then raise exception 'Attendance is locked'; end if;
   if TG_OP='INSERT' and e.audience_frozen_at is not null then raise exception 'Frozen participants cannot be added'; end if;
   if TG_OP='UPDATE' and (to_jsonb(new)-array['time_in','time_out','time_in_method','time_out_method','time_in_recorded_by','time_out_recorded_by','updated_at'])
    is distinct from (to_jsonb(old)-array['time_in','time_out','time_in_method','time_out_method','time_in_recorded_by','time_out_recorded_by','updated_at']) then raise exception 'Participant snapshot is immutable'; end if;
   if new.time_in_recorded_by=new.student_id or new.time_out_recorded_by=new.student_id then raise exception 'Self attendance forbidden'; end if;
   if (new.time_in is not null and (e.time_in_from is null or not(new.time_in between e.time_in_from and e.time_in_until) or new.time_in>clock_timestamp()))
    or (new.time_out is not null and (e.time_out_from is null or not(new.time_out between e.time_out_from and e.time_out_until) or new.time_out>clock_timestamp())) then raise exception 'Attendance outside capture windows'; end if;
  end if;
 elsif TG_TABLE_NAME='service_sessions' then
  if TG_OP='DELETE' then raise exception 'Service history cannot be deleted'; end if;
  if old.ended_at is not null then raise exception 'Ended session is immutable'; end if;
  if new.id<>old.id or new.semester_id<>old.semester_id or new.bucket<>old.bucket or new.created_by<>old.created_by or new.created_at<>old.created_at then raise exception 'Session identity is immutable'; end if;
  if new.ended_at is not null and new.ended_by<>new.created_by then raise exception 'Session issuer must finalize'; end if;
 else
  select * into s from public.service_sessions where id=coalesce(new.session_id,old.session_id) for update;
  if TG_OP='DELETE' or s.ended_at is not null then raise exception 'Finalized service attendance cannot change'; end if;
  if TG_OP='UPDATE' and (to_jsonb(new)-array['time_in','time_out','recorded_by','excluded_at','excluded_by','updated_at'])
   is distinct from (to_jsonb(old)-array['time_in','time_out','recorded_by','excluded_at','excluded_by','updated_at']) then raise exception 'Service participant identity is immutable'; end if;
  if new.recorded_by=new.student_id or new.excluded_by=new.student_id then raise exception 'Self attendance forbidden'; end if;
  if (new.time_in is not null and (new.recorded_by is null or not(new.time_in between s.time_in_from and s.time_in_until) or new.time_in>clock_timestamp()))
   or (new.time_out is not null and (not(new.time_out between s.time_out_from and s.time_out_until) or new.time_out>clock_timestamp())) then raise exception 'Invalid service attendance'; end if;
 end if;
 return new;
end $$;

create or replace function f_access_private.ledger_checks() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare n bigint; last_unit integer; contexts bigint; expected integer; payload jsonb;
 a public.event_attendance%rowtype; e public.events%rowtype; r public.event_consequence_rules%rowtype;
begin
 if TG_TABLE_NAME='demerits' then
  select count(*),max(incident_unit_index),count(distinct jsonb_build_array(student_id,semester_id,bucket,source,misconduct_id,
   description,incident_on,event_attendance_id,consequence_outcome,issued_by,external_source_name))
   into n,last_unit,contexts from public.demerits where incident_group_id=new.incident_group_id;
  if n<>last_unit or contexts<>1 then raise exception 'Demerit group must be contiguous and share context'; end if;
  if new.source='council' then
   select * into a from public.event_attendance where id=new.event_attendance_id;
   select * into e from public.events where id=a.event_id;
   select * into r from public.event_consequence_rules where event_id=e.id;
   expected:=case new.consequence_outcome when 'absence' then r.absence_demerit_days else r.late_demerit_days end;
   if e.attendance_locked_at is null or expected is null or n<>expected
    or new.source_unit_index<>new.incident_unit_index then raise exception 'Council units require finalized event and complete configured count'; end if;
   if new.consequence_outcome is distinct from (case when a.time_in is null
    or (r.requires_time_out and a.time_out is null) then 'absence'
    when a.time_in>e.time_in_from+make_interval(mins=>e.late_after_minutes) then 'late' else null end)
    or e.consequence_bucket is null or e.consequence_bucket is distinct from new.bucket then raise exception 'Council consequence outcome/bucket mismatch'; end if;
  else
   select q.payload into payload from f_cmd_private.requests q where q.request_key=new.incident_group_id and q.command='log_demerits';
   if found and n<>(payload->>'days')::integer then raise exception 'Incomplete demerit command unit count'; end if;
  end if;
 elsif TG_TABLE_NAME='merits' and to_jsonb(new)->>'award_request_key' is not null then
  select count(*),max(award_unit_index),count(distinct jsonb_build_array(student_id,semester_id,source,description,awarded_on,expires_on,awarded_by,external_source_name))
   into n,last_unit,contexts from public.merits where award_request_key=new.award_request_key;
  if n<>last_unit or contexts<>1 then raise exception 'Merit award group must be contiguous and share context'; end if;
  select q.payload into payload from f_cmd_private.requests q where q.request_key=new.award_request_key and q.command='award_merits';
  if found and n<>(payload->>'days')::integer then raise exception 'Incomplete merit command unit count'; end if;
 elsif TG_TABLE_NAME='merit_applications' then
  select count(*),count(distinct jsonb_build_array(student_id,bucket,applied_at)) into n,contexts
   from public.merit_applications where application_group_id=new.application_group_id;
  if contexts<>1 then raise exception 'Merit election group context mismatch'; end if;
  select q.payload into payload from f_cmd_private.requests q where q.request_key=new.application_group_id and q.command='apply_merits';
  if found and n<>(payload->>'days')::integer then raise exception 'Incomplete merit election unit count'; end if;
 end if;
 return null;
end $$;

-- An election is an intermediate in-transaction state, never a committed draft
-- setting. Check the current parent, not the intermediate NEW transition image.
create function f_access_private.event_bucket_final_check() returns trigger
language plpgsql security definer set search_path = pg_catalog as $$
begin
    if exists (select 1 from public.events e where e.id = new.id and
        ((e.consequence_bucket is not null and
          (e.audience_frozen_at is null or e.attendance_locked_at is null))
         or (TG_OP = 'INSERT' and e.attendance_locked_at is not null
             and e.consequence_bucket is null))) then
        raise exception 'New event finalization and bucket election must commit together'
            using errcode = '23514';
    end if;
    return null;
end $$;
revoke all on function f_access_private.event_bucket_final_check()
    from public, anon, authenticated, service_role;
create constraint trigger event_bucket_finalized after insert or update on public.events
    deferrable initially deferred for each row
    execute function f_access_private.event_bucket_final_check();

-- Before balance_serialization: acquire/recheck parent first, not a balance
-- lock followed by a parent lock. Multi-row server commands must still prelock
-- all balance keys in sorted order, as in 003. No post-finalization unit append.
create function f_access_private.council_event_parent_guard() returns trigger
language plpgsql security definer set search_path = pg_catalog as $$
declare e public.events%rowtype;
begin
    if new.source = 'council' then
        select ev.* into e from public.events ev
        join public.event_attendance a on a.event_id = ev.id
        where a.id = new.event_attendance_id for update of ev;
        if not found or e.audience_frozen_at is null
            or e.attendance_locked_at is not null
            or e.consequence_bucket is null
            or e.consequence_bucket is distinct from new.bucket then
            raise exception 'Council unit requires open generation with matching event bucket'
                using errcode = '23514';
        end if;
    end if;
    return new;
end $$;
revoke all on function f_access_private.council_event_parent_guard()
    from public, anon, authenticated, service_role;
create trigger a_council_event_parent before insert on public.demerits
    for each row execute function f_access_private.council_event_parent_guard();

-- No SQL caller in 001/002/003 references this RPC. RESTRICT (the default)
-- deliberately refuses to remove unexpected deployed SQL dependencies.
revoke all on function public.generate_event_consequences(uuid, uuid, uuid)
    from public, anon, authenticated, service_role;
drop function public.generate_event_consequences(uuid, uuid, uuid);

create function public.generate_event_consequences(
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
            v_outcome := case when a.time_in is null or not (a.time_in between e.time_in_from and e.time_in_until)
                or (r.requires_time_out and (a.time_out is null or not (a.time_out between e.time_out_from and e.time_out_until))) then 'absence'
                when a.time_in > e.time_in_from + make_interval(mins => e.late_after_minutes) then 'late' else null end;
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
revoke all on function public.generate_event_consequences(uuid, uuid, uuid, public.bucket)
    from public, anon, authenticated, service_role;
grant execute on function public.generate_event_consequences(uuid, uuid, uuid, public.bucket) to service_role;

-- Remove the obsolete setting only AFTER all known consumers are replaced.
-- Catch additional deployed stored-function consumers instead of silently
-- stranding a PL/pgSQL body (whose column references lack catalog dependencies).
do $dependencies$
begin
    if exists (
        select 1 from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname not in ('pg_catalog', 'information_schema')
            and p.prosrc ilike '%council_event_bucket%'
    ) then
        raise exception 'Unreplaced stored routine references council_event_bucket; reconcile before 004'
            using errcode = '55000';
    end if;
end $dependencies$;
alter table f_cmd_private.settings drop column council_event_bucket;

-- Preserve any approved existing timezone; validate rather than overwrite it.
-- With no settings row, the explicit institutional default is Asia/Manila.
do $timezone$
begin
    if exists (
        select 1 from f_cmd_private.settings s
        where not exists (select 1 from pg_catalog.pg_timezone_names z
            where z.name = s.institutional_timezone)
    ) then
        raise exception 'Existing institutional timezone is invalid; reconcile before 004'
            using errcode = '55000';
    end if;
    insert into f_cmd_private.settings(singleton, institutional_timezone)
        values (true, 'Asia/Manila') on conflict (singleton) do nothing;
end $timezone$;

-- Force deferred backfill checks before COMMIT, with the new function bodies.
set constraints all immediate;
commit;
