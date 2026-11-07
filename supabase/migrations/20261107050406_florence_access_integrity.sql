-- Florence V1 fresh-install access/integrity handoff: run after 001, before 003.
-- Not an upgrade or applied migration. Owner must be a trusted non-login role
-- capable of bypassing RLS; never transfer definer functions to an API role.
-- No ordinary writes, including notification read-state updates, are granted.
-- Service-role commands still require application actor authorization. Triggers
-- preserve facts even for BYPASSRLS writers, not against owners disabling them.
-- Direct server transactions must prelock in 003 order: request -> parent ->
-- sorted balance keys -> units; finance receipt -> payment -> sorted obligations.
-- Row triggers cannot repair an already-inverted caller lock order. Deadlock and
-- serialization failures require whole-transaction retry with the same key.
-- Read helpers expose only the caller's identity/capabilities. Directory and
-- attendance lookup RPCs deliberately project columns instead of granting a
-- broad profile SELECT. Files/storage and invitation delivery remain server-only.
-- Deferred checks inspect final transaction state, not intermediate RPC writes.
-- Runtime ACL, PL/pgSQL and multi-session tests are required before deployment.

begin;
create schema f_access_private;
revoke all on schema f_access_private from public, anon, authenticated, service_role;
grant usage on schema f_access_private to authenticated;

create function f_access_private.me() returns uuid
language sql stable security definer set search_path = pg_catalog as $$
 select id from public.profiles where auth_user_id = auth.uid() and account_status = 'active'
$$;
create function f_access_private.has_role(p_role text) returns boolean
language sql stable security definer set search_path = pg_catalog as $$
 select exists(select 1 from public.role_assignments where profile_id = f_access_private.me()
 and role = p_role and removed_at is null)
$$;
create function f_access_private.council(p_capture boolean default false) returns boolean
language sql stable security definer set search_path = pg_catalog as $$
 select exists(select 1 from public.council_memberships where profile_id = f_access_private.me()
 and removed_at is null and (p_capture or access_role in ('executive','operations')))
$$;
create function f_access_private.executive() returns boolean
language sql stable security definer set search_path = pg_catalog as $$
 select exists(select 1 from public.council_memberships where profile_id = f_access_private.me()
 and removed_at is null and access_role = 'executive')
$$;
create function f_access_private.faculty() returns boolean
language sql stable security definer set search_path = pg_catalog as $$
 select f_access_private.has_role('Academic Instructor') or f_access_private.has_role('Clinical Instructor')
$$;
create function f_access_private.coordinator() returns boolean
language sql stable security definer set search_path = pg_catalog as $$
 select (f_access_private.has_role('Academic Coordinator') and f_access_private.has_role('Academic Instructor'))
 or (f_access_private.has_role('RLE Coordinator') and f_access_private.has_role('Clinical Instructor'))
$$;
-- Both coordinator assignments review disciplinary history per FL-029; neither
-- receives finance, Faculty account administration or issuer override authority.
create function f_access_private.student() returns boolean
language sql stable security definer set search_path = pg_catalog as $$
 select exists(select 1 from public.enrollments where student_id = f_access_private.me())
$$;
create function f_access_private.event_visible(p_event uuid) returns boolean
language sql stable security definer set search_path = pg_catalog as $$
 select f_access_private.council(true) or exists(
 select 1 from public.events e where e.id = p_event and f_access_private.me() is not null
 and e.audience_frozen_at is not null and exists(select 1 from public.event_attendance a
 where a.event_id = e.id and a.student_id = f_access_private.me()))
$$;
create function f_access_private.session_visible(p_session uuid) returns boolean
language sql stable security definer set search_path = pg_catalog as $$
 select f_access_private.coordinator() or exists(select 1 from public.service_sessions s
 where s.id = p_session and ((f_access_private.faculty() and s.created_by = f_access_private.me())
 or exists(select 1 from public.service_participants a where a.session_id = s.id
 and a.student_id = f_access_private.me())))
$$;

-- Deliberately no auth_user_id/email/internal timestamps in a general lookup.
create function public.florence_student_directory(p_query text, p_limit integer default 30)
returns table(id uuid, university_id text, first_name text, middle_name text, last_name text, suffix text)
language plpgsql stable security definer set search_path = pg_catalog as $$
begin
 if not (f_access_private.council() or f_access_private.faculty()) then
 raise exception 'Directory access denied' using errcode = '42501'; end if;
 if p_query is null or length(btrim(p_query)) < 2 or length(p_query) > 100
 or p_limit is null or p_limit not between 1 and 100 then raise exception 'Bounded search required'; end if;
 return query select p.id,p.university_id,p.first_name,p.middle_name,p.last_name,p.suffix
 from public.profiles p where exists(select 1 from public.enrollments n where n.student_id=p.id)
 and (strpos(lower(p.first_name || ' ' || p.last_name),lower(btrim(p_query))) > 0
 or strpos(p.university_id,btrim(p_query)) > 0) order by p.last_name,p.first_name,p.id limit p_limit;
end $$;
create function public.florence_attendance_lookup(p_event uuid, p_query text, p_limit integer default 30)
returns table(student_id uuid, university_id text, first_name text, last_name text,
 year_level smallint, academic_status public.academic_status)
language plpgsql stable security definer set search_path = pg_catalog as $$
begin
 if not f_access_private.council(true) then raise exception 'Attendance access denied' using errcode='42501'; end if;
 if p_query is null or length(btrim(p_query)) < 2 or length(p_query)>100
 or p_limit is null or p_limit not between 1 and 100 then raise exception 'Bounded search required'; end if;
 return query select p.id,p.university_id,p.first_name,p.last_name,a.year_level_snapshot,a.academic_status_snapshot
 from public.event_attendance a join public.profiles p on p.id=a.student_id
 where a.event_id=p_event and (strpos(lower(p.first_name || ' ' || p.last_name),lower(btrim(p_query)))>0
 or strpos(p.university_id,btrim(p_query))>0) order by p.last_name,p.first_name,p.id limit p_limit;
 -- Publication/freeze is required before participant lookup; no general roster fallback.
end $$;

-- ACLs are scoped to objects owned by this handoff, never schema-wide defaults.
do $acl$
declare f record;
begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='f_access_private' loop
 execute format('revoke all on function %s from public, anon, authenticated, service_role', f.sig);
 execute format('grant execute on function %s to authenticated', f.sig);
 end loop;
end $acl$;
revoke all on function public.florence_student_directory(text,integer),
 public.florence_attendance_lookup(uuid,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.florence_student_directory(text,integer),
 public.florence_attendance_lookup(uuid,text,integer) to authenticated;
grant usage on type public.bucket,public.academic_status,public.council_access_role to authenticated,service_role;

-- Every policy is SELECT-only and active-profile gated, directly or by helper.
create policy own_profile on public.profiles for select to authenticated using(id=f_access_private.me());
grant select(id,university_id,email,first_name,middle_name,last_name,suffix,account_status) on public.profiles to authenticated;
create policy assignments_read on public.role_assignments for select to authenticated using(
 profile_id=f_access_private.me() or f_access_private.has_role('Platform Admin'));
create policy memberships_read on public.council_memberships for select to authenticated using(
 profile_id=f_access_private.me() or f_access_private.executive() or f_access_private.has_role('Platform Admin'));
create policy semesters_read on public.semesters for select to authenticated using(f_access_private.me() is not null);
create policy enrollment_read on public.enrollments for select to authenticated using(
 student_id=f_access_private.me() or f_access_private.council() or f_access_private.faculty());
create policy imports_read on public.roster_imports for select to authenticated using(f_access_private.council());
-- summary/file metadata are not granted: import diagnostics can contain private raw CSV.
grant select(id,semester_id,status,created_by,created_at,applied_at) on public.roster_imports to authenticated;
create policy events_read on public.events for select to authenticated using(f_access_private.event_visible(id));
create policy rules_read on public.event_consequence_rules for select to authenticated using(f_access_private.council());
create policy attendance_read on public.event_attendance for select to authenticated using(
 student_id=f_access_private.me() or f_access_private.council(true));
create policy feedback_read on public.event_feedback for select to authenticated using(
 student_id=f_access_private.me() or f_access_private.council());
create policy fees_read on public.fee_definitions for select to authenticated using(f_access_private.council());
create policy fines_read on public.fine_definitions for select to authenticated using(f_access_private.council());
create policy publications_read on public.fee_publications for select to authenticated using(f_access_private.council());
create policy obligations_read on public.obligations for select to authenticated using(student_id=f_access_private.me() or f_access_private.council());
create policy accounts_read on public.payment_accounts for select to authenticated using(
 f_access_private.executive() or (archived_at is null and f_access_private.student()));
-- Operations' Student access sees active destinations, never management metadata.
grant select(id,label,account_name,account_reference,instructions,qr_file_id,archived_at) on public.payment_accounts to authenticated;
create policy payments_read on public.payments for select to authenticated using(student_id=f_access_private.me() or f_access_private.council());
create policy items_read on public.payment_items for select to authenticated using(student_id=f_access_private.me() or f_access_private.council());
create policy receipts_read on public.payment_receipts for select to authenticated using(
 f_access_private.council() or exists(select 1 from public.payments p where p.receipt_id=payment_receipts.id and p.student_id=f_access_private.me()));
create policy refunds_read on public.payment_refunds for select to authenticated using(
 f_access_private.council() or exists(select 1 from public.payments p where p.id=payment_id and p.student_id=f_access_private.me()));
create policy catalog_read on public.misconduct_catalog for select to authenticated using(
 f_access_private.faculty() or f_access_private.has_role('Platform Admin'));
create policy demerits_read on public.demerits for select to authenticated using(
 student_id=f_access_private.me() or f_access_private.coordinator()
 or (source='council' and f_access_private.council())
 or (issued_by=f_access_private.me() and f_access_private.faculty()));
create policy endorsements_read on public.merit_endorsements for select to authenticated using(
 student_id=f_access_private.me() or f_access_private.council() or f_access_private.coordinator()
 or (assigned_instructor_id=f_access_private.me() and f_access_private.faculty()));
create policy merits_read on public.merits for select to authenticated using(
 student_id=f_access_private.me() or f_access_private.coordinator()
 or (source='endorsement' and f_access_private.council())
 or (awarded_by=f_access_private.me() and f_access_private.faculty()));
-- Council must not infer whole-ledger balances or follow its awards into Faculty offsets.
create policy applications_read on public.merit_applications for select to authenticated using(
 student_id=f_access_private.me() or f_access_private.coordinator());
create policy sessions_read on public.service_sessions for select to authenticated using(f_access_private.session_visible(id));
create policy participants_read on public.service_participants for select to authenticated using(
 student_id=f_access_private.me() or f_access_private.coordinator() or exists(
 select 1 from public.service_sessions s where s.id=session_id and s.created_by=f_access_private.me() and f_access_private.faculty()));
create policy credits_read on public.service_credits for select to authenticated using(
 student_id=f_access_private.me() or f_access_private.coordinator() or (issued_by=f_access_private.me() and f_access_private.faculty()));
create policy clearances_read on public.clearances for select to authenticated using(
 student_id=f_access_private.me() or f_access_private.council() or f_access_private.coordinator());
create policy notifications_read on public.notifications for select to authenticated using(recipient_id=f_access_private.me());
grant select on public.role_assignments,public.council_memberships,public.semesters,public.enrollments,
 public.events,public.event_consequence_rules,public.event_attendance,public.event_feedback,
 public.fee_definitions,public.fine_definitions,public.fee_publications,public.obligations,
 public.payments,public.payment_items,public.payment_receipts,public.payment_refunds,public.misconduct_catalog,
 public.demerits,public.merit_endorsements,public.merits,public.merit_applications,
 public.service_sessions,public.service_participants,public.service_credits,public.clearances,public.notifications to authenticated;
-- Normalize Supabase's possible default service-role ACLs explicitly. In
-- particular TRUNCATE bypasses row history triggers and must not be inherited.
-- This is a trusted server surface, NOT user-context authorization: a leaked
-- service key can still fabricate facts. Never expose generic table mutations.
revoke all on public.profiles,public.role_assignments,public.council_memberships,
 public.invitations,public.semesters,public.enrollments,public.files,public.roster_imports,
 public.events,public.event_consequence_rules,public.event_attendance,public.event_feedback,
 public.fee_definitions,public.fine_definitions,public.fee_publications,public.obligations,
 public.payment_accounts,public.payments,public.payment_items,public.payment_receipts,public.payment_refunds,
 public.misconduct_catalog,public.demerits,public.merit_endorsements,public.merits,public.merit_applications,
 public.service_sessions,public.service_participants,public.service_credits,public.clearances,public.notifications from service_role;
grant select,insert,update,delete on public.profiles,public.role_assignments,public.council_memberships,
 public.invitations,public.semesters,public.enrollments,public.files,public.roster_imports,
 public.events,public.event_consequence_rules,public.event_attendance,public.event_feedback,
 public.fee_definitions,public.fine_definitions,public.fee_publications,public.obligations,
 public.payment_accounts,public.payments,public.payment_items,public.payment_receipts,public.payment_refunds,
 public.misconduct_catalog,public.demerits,public.merit_endorsements,public.merits,public.merit_applications,
 public.service_sessions,public.service_participants,public.service_credits,public.clearances,public.notifications to service_role;
grant usage on schema public to authenticated,service_role;
-- invitations/files have no ordinary grants or policies. A server must authorize
-- signed private-object access; knowing a file UUID does not authorize download.

-- Generic one-way history guard: only explicitly listed lifecycle fields change.
create function f_access_private.history_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare allowed text[] := string_to_array(TG_ARGV[0],','); terminal text := TG_ARGV[1];
begin
 if TG_OP='DELETE' then raise exception '% history cannot be deleted',TG_TABLE_NAME using errcode='23514'; end if;
 if (to_jsonb(new)-allowed) is distinct from (to_jsonb(old)-allowed) then
 raise exception '% immutable facts cannot change',TG_TABLE_NAME using errcode='23514'; end if;
 if terminal is not null and to_jsonb(old)->terminal <> 'null'::jsonb then
 raise exception '% final decision cannot change',TG_TABLE_NAME using errcode='23514'; end if;
 return new;
end $$;
create function f_access_private.append_only() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin raise exception '% is append-only',TG_TABLE_NAME using errcode='23514'; end $$;
-- Do not include payments here: pending decisions and atomic supersession are valid.
do $triggers$
declare t text;
begin
 foreach t in array array['files','event_feedback','fee_publications','payment_receipts','payment_items',
 'payment_refunds','merits','merit_applications','clearances'] loop
 execute format('create trigger history_immutable before update or delete on public.%I for each row execute function f_access_private.append_only()',t);
 end loop;
end $triggers$;
create trigger demerits_history before update or delete on public.demerits for each row
 execute function f_access_private.history_guard('waived_at,waived_by,waiver_reason','waived_at');
create trigger obligations_history before update or delete on public.obligations for each row
 execute function f_access_private.history_guard('waived_at,waived_by,waiver_reason','waived_at');
create trigger credits_history before update or delete on public.service_credits for each row
 execute function f_access_private.history_guard('revoked_at,revoked_by,revocation_reason','revoked_at');
create trigger endorsements_history before update or delete on public.merit_endorsements for each row
 execute function f_access_private.history_guard('status,decided_by,decided_at,decision_reason','decided_at');
create trigger assignments_history before update or delete on public.role_assignments for each row
 execute function f_access_private.history_guard('removed_by,removed_at','removed_at');
create trigger memberships_history before update or delete on public.council_memberships for each row
 execute function f_access_private.history_guard('position_label,removed_by,removed_at','removed_at');
-- Preset reassignment closes the old membership and inserts a new one.

create function f_access_private.parent_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare e public.events%rowtype; s public.service_sessions%rowtype;
begin
 if TG_TABLE_NAME='events' then
  if TG_OP='DELETE' then raise exception 'Archive events; do not delete'; end if;
  if new.id<>old.id or new.semester_id<>old.semester_id or new.created_by<>old.created_by or new.created_at<>old.created_at then raise exception 'Event identity is immutable'; end if;
  if old.audience_frozen_at is not null and
   (to_jsonb(new)-array['name','venue','archived_at','attendance_locked_at','updated_at']) is distinct from
   (to_jsonb(old)-array['name','venue','archived_at','attendance_locked_at','updated_at']) then raise exception 'Published event configuration is frozen'; end if;
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
create trigger event_freeze before update or delete on public.events for each row execute function f_access_private.parent_guard();
create trigger event_rules_freeze before insert or update or delete on public.event_consequence_rules for each row execute function f_access_private.parent_guard();
create trigger event_attendance_freeze before insert or update or delete on public.event_attendance for each row execute function f_access_private.parent_guard();
create trigger service_freeze before update or delete on public.service_sessions for each row execute function f_access_private.parent_guard();
create trigger service_attendance_freeze before insert or update or delete on public.service_participants for each row execute function f_access_private.parent_guard();

-- Balance keys exactly match 003, including increases/revocations. For multi-row
-- direct writes preacquire ALL affected keys in sorted bigint order first.
create function f_access_private.balance_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare k bigint; balance bigint;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'Balance mutations require READ COMMITTED'; end if;
 if TG_TABLE_NAME='merit_applications' then
  for k in select hashtextextended('florence:balance:'||new.student_id::text||':'||b::text,0)
   from unnest(enum_range(null::public.bucket)) b order by 1 loop perform pg_advisory_xact_lock(k); end loop;
 else
  perform pg_advisory_xact_lock(hashtextextended('florence:balance:'||new.student_id::text||':'||new.bucket::text,0));
 end if;
 if (TG_TABLE_NAME='demerits' and TG_OP='UPDATE' and to_jsonb(old)->>'waived_at' is null and to_jsonb(new)->>'waived_at' is not null)
 or (TG_TABLE_NAME in ('merit_applications','service_credits') and TG_OP='INSERT') then
  select (select count(*) from public.demerits where student_id=new.student_id and bucket=new.bucket and waived_at is null)
   -(select count(*) from public.merit_applications where student_id=new.student_id and bucket=new.bucket)
   -(select count(*) from public.service_credits where student_id=new.student_id and bucket=new.bucket and revoked_at is null) into balance;
  if balance<=0 then raise exception 'Insufficient matching balance' using errcode='23514'; end if;
 end if;
 if TG_TABLE_NAME='demerits' then
  if new.waived_by=new.student_id then raise exception 'Self waiver forbidden'; end if;
    if new.waived_at is not null and new.source<>'council' and new.waived_by<>new.issued_by then raise exception 'Only original issuer may waive Faculty entry'; end if;
 elsif TG_TABLE_NAME='service_credits' then
  if new.issued_by=new.student_id or new.revoked_by=new.student_id then raise exception 'Self service credit mutation forbidden'; end if;
  if TG_OP='UPDATE' and new.revoked_by<>old.issued_by then raise exception 'Only credit issuer may revoke'; end if;
 end if;
 return new;
end $$;
create trigger balance_serialization before insert or update on public.demerits for each row execute function f_access_private.balance_guard();
create trigger balance_serialization before insert on public.merit_applications for each row execute function f_access_private.balance_guard();
create trigger balance_serialization before insert or update on public.service_credits for each row execute function f_access_private.balance_guard();

create function f_access_private.payment_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if TG_OP='DELETE' then raise exception 'Payment history cannot be deleted'; end if;
 if old.record_status='superseded' then raise exception 'Superseded payment is immutable'; end if;
 if old.status='pending' then
  if (to_jsonb(new)-array['status','receipt_id','is_receipt_record','decided_by','decided_at','decision_reason'])
   is distinct from (to_jsonb(old)-array['status','receipt_id','is_receipt_record','decided_by','decided_at','decision_reason'])
   or new.status='pending' then raise exception 'Only a final pending-payment decision is allowed'; end if;
 else
  if new.record_status<>'superseded' or (to_jsonb(new)-'record_status') is distinct from (to_jsonb(old)-'record_status') then raise exception 'Correct via linked replacement, not payment edits'; end if;
 end if;
 if new.decided_by=new.student_id then raise exception 'Self payment decision forbidden'; end if;
 return new;
end $$;
create trigger payments_history before update or delete on public.payments for each row execute function f_access_private.payment_guard();

-- Commit-time checks allow 003's insert-children -> finalize-parent order and
-- supersede -> insert-replacement order without allowing half-finished commits.
create function f_access_private.final_checks() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare p public.payments%rowtype; e public.events%rowtype; s public.service_sessions%rowtype;
 r public.event_consequence_rules%rowtype; v_id uuid; v_count bigint; v_total numeric;
begin
 if TG_TABLE_NAME in ('payments','payment_items','payment_receipts','payment_refunds') then
  if TG_TABLE_NAME='payment_items' then v_id:=new.payment_id;
  elsif TG_TABLE_NAME='payment_refunds' then
   select * into p from public.payments where receipt_id=new.receipt_id and is_receipt_record and record_status='current'; v_id:=p.id;
  elsif TG_TABLE_NAME='payment_receipts' then
   select * into p from public.payments where receipt_id=new.id and is_receipt_record and record_status='current'; v_id:=p.id;
   if v_id is null then raise exception 'Receipt needs one authoritative current payment'; end if;
  else v_id:=new.id; end if;
  select * into p from public.payments where id=v_id;
  if not found then raise exception 'Missing payment'; end if;
  -- The caller must take receipt/payment locks BEFORE this sorted item lock.
  perform 1 from public.obligations o where o.id in(select obligation_id from public.payment_items where payment_id=p.id) order by o.id for update;
  select count(*),sum(amount) into v_count,v_total from public.payment_items where payment_id=p.id;
  if v_count=0 or v_total<>p.amount or exists(select 1 from public.payment_items i join public.obligations o on o.id=i.obligation_id where i.payment_id=p.id and i.amount<>o.amount) then raise exception 'Payment must contain complete full-value items'; end if;
  if p.record_status='superseded' and not exists(select 1 from public.payments q where q.supersedes_payment_id=p.id) then raise exception 'Superseded payment needs replacement'; end if;
  if p.supersedes_payment_id is not null and not exists(select 1 from public.payments q where q.id=p.supersedes_payment_id and q.record_status='superseded'
   and q.created_at<=p.created_at and q.method=p.method and q.status=p.status and q.is_receipt_record
   and q.payment_account_id is not distinct from p.payment_account_id
   and q.destination_label is not distinct from p.destination_label
   and q.destination_account_name is not distinct from p.destination_account_name
   and q.destination_account_reference is not distinct from p.destination_account_reference
   and q.reference_number is not distinct from p.reference_number and q.proof_file_id is not distinct from p.proof_file_id) then raise exception 'Invalid correction predecessor/evidence'; end if;
  if p.receipt_id is not null then
   if (select count(*) from public.payments q where q.receipt_id=p.receipt_id and q.is_receipt_record and q.record_status='current')<>1 then raise exception 'Receipt representation must be unique and present'; end if;
   if exists(select 1 from public.payment_refunds f join public.payments q on q.receipt_id=f.receipt_id and q.is_receipt_record and q.record_status='current'
    join public.payment_receipts rc on rc.id=f.receipt_id where f.receipt_id=p.receipt_id and (f.amount<>q.amount or f.refunded_at<rc.received_at or f.recorded_by=q.student_id)) then raise exception 'Invalid full refund'; end if;
   if p.is_receipt_record and p.status='rejected' and not exists(select 1 from public.payment_refunds f where f.receipt_id=p.receipt_id) then raise exception 'Rejected actual receipt requires completed return'; end if;
   if not p.is_receipt_record and not exists(select 1 from public.payments q where q.receipt_id=p.receipt_id and q.is_receipt_record and q.record_status='current' and q.student_id=p.student_id) then raise exception 'Duplicate receipt beneficiary mismatch'; end if;
  end if;
  if p.status='verified' and p.record_status='current' and not exists(select 1 from public.payment_refunds f where f.receipt_id=p.receipt_id) then
   if exists(select 1 from public.payment_items i join public.obligations o on o.id=i.obligation_id where i.payment_id=p.id and o.waived_at is not null) then raise exception 'Cannot settle waived debt'; end if;
   if exists(select 1 from public.payment_items i join public.payment_items j on j.obligation_id=i.obligation_id and j.payment_id<>i.payment_id
    join public.payments q on q.id=j.payment_id where i.payment_id=p.id and q.status='verified' and q.record_status='current' and q.is_receipt_record
    and not exists(select 1 from public.payment_refunds f where f.receipt_id=q.receipt_id)) then raise exception 'Double settlement forbidden'; end if;
  end if;
 elsif TG_TABLE_NAME in ('events','event_consequence_rules','event_attendance') then
  if TG_TABLE_NAME='events' then v_id:=new.id; else v_id:=new.event_id; end if;
  select * into e from public.events where id=v_id;
  if e.audience_frozen_at is not null then
   select * into r from public.event_consequence_rules where event_id=e.id;
   if not found or e.time_in_from is null or (r.requires_time_out and e.time_out_from is null)
    or (r.absence_fine_definition_id is null)<>(r.absence_fine_amount is null)
    or (r.late_fine_definition_id is null)<>(r.late_fine_amount is null) then raise exception 'Frozen event requires complete windows/rules/amount snapshots'; end if;
  end if;
 elsif TG_TABLE_NAME in ('service_sessions','service_credits') then
  if TG_TABLE_NAME='service_sessions' then v_id:=new.id; else v_id:=new.session_id; end if;
  select * into s from public.service_sessions where id=v_id;
  if TG_TABLE_NAME='service_credits' then
   if s.ended_at is null or new.issued_by<>s.created_by or not exists(select 1 from public.service_participants a where a.id=new.service_participant_id and a.excluded_at is null) then raise exception 'Credit requires finalized included service and issuer'; end if;
  end if;
  if s.ended_at is not null and exists(select 1 from public.service_participants a where a.session_id=s.id and a.excluded_at is null
   and (a.time_in is null or a.time_out is null or a.recorded_by is null or not(a.time_in between s.time_in_from and s.time_in_until)
   or not(a.time_out between s.time_out_from and s.time_out_until))) then raise exception 'Finalized service attendance incomplete'; end if;
 elsif TG_TABLE_NAME in ('merits','merit_endorsements') then
  if TG_TABLE_NAME='merit_endorsements' then v_id:=new.id; else v_id:=new.endorsement_id; end if;
  if v_id is not null then
   if exists(select 1 from public.merit_endorsements x where x.id=v_id and
    ((x.status='approved' and ((select count(*) from public.merits m where m.endorsement_id=x.id)<>x.requested_days
     or exists(select 1 from public.merits m where m.endorsement_id=x.id and (m.awarded_by<>x.assigned_instructor_id or m.endorsement_unit_index>x.requested_days))))
    or (x.status<>'approved' and exists(select 1 from public.merits m where m.endorsement_id=x.id)))) then raise exception 'Endorsement decision/award units inconsistent'; end if;
  end if;
 elsif TG_TABLE_NAME='clearances' then
  perform pg_advisory_xact_lock(hashtextextended('florence:clearance:'||new.student_id::text||':'||new.semester_id::text,0));
  if new.confirmed_by=new.student_id or (new.component<>'council' and not exists(select 1 from public.clearances c where c.student_id=new.student_id and c.semester_id=new.semester_id and c.component='council')) then raise exception 'Invalid clearance prerequisite or self confirmation'; end if;
 elsif TG_TABLE_NAME='obligations' then
  if new.kind='fine' then
   select ev.* into e from public.events ev join public.event_attendance a on a.event_id=ev.id where a.id=new.event_attendance_id;
   select * into r from public.event_consequence_rules where event_id=e.id;
   v_total:=case new.consequence_outcome when 'absence' then r.absence_fine_amount else r.late_fine_amount end;
   if e.attendance_locked_at is null or v_total is null or new.amount<>v_total then raise exception 'Fine requires finalized configured snapshot amount'; end if;
      if not exists(select 1 from public.event_attendance a where a.id=new.event_attendance_id and new.consequence_outcome=
       (case when a.time_in is null or (r.requires_time_out and a.time_out is null) then 'absence'
       when a.time_in>e.time_in_from+make_interval(mins=>e.late_after_minutes) then 'late' else null end)) then raise exception 'Fine consequence outcome mismatch'; end if;
  end if;
  if new.waived_by=new.student_id then raise exception 'Self obligation waiver forbidden'; end if;
  if new.kind='fee' and not exists(select 1 from public.fee_publications f where f.id=new.fee_publication_id and f.amount=new.amount and f.description=new.description) then raise exception 'Fee snapshot mismatch'; end if;
  if new.waived_at is not null and exists(select 1 from public.payment_items i join public.payments q on q.id=i.payment_id where i.obligation_id=new.id and q.status='verified' and q.record_status='current' and not exists(select 1 from public.payment_refunds f where f.receipt_id=q.receipt_id)) then raise exception 'Paid obligation cannot be waived'; end if;
 end if;
 return null;
end $$;
do $checks$
declare t text;
begin
 foreach t in array array['payments','payment_items','payment_receipts','payment_refunds','events','event_consequence_rules','event_attendance',
 'service_sessions','service_credits','merits','merit_endorsements','clearances','obligations'] loop
 execute format('create constraint trigger final_consistency after insert or update on public.%I deferrable initially deferred for each row execute function f_access_private.final_checks()',t);
 end loop;
end $checks$;

-- Enforce fixed account combinations at commit, so valid remove/add transitions
-- can be performed atomically. Parent locking serializes competing assignments.
create function f_access_private.assignment_lock() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform 1 from public.profiles where id=new.profile_id for update;
 return new;
end $$;
create function f_access_private.assignment_check() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare roles text[]; student boolean; member boolean;
begin
 select array_agg(role) into roles from public.role_assignments where profile_id=new.profile_id and removed_at is null;
 roles:=coalesce(roles,array[]::text[]);
 select university_id is not null into student from public.profiles where id=new.profile_id;
 select exists(select 1 from public.council_memberships where profile_id=new.profile_id and removed_at is null) into member;
 if (student and cardinality(roles)>0) or (member and not student)
 or ('Academic Instructor'=any(roles) and 'Clinical Instructor'=any(roles))
 or ('Academic Coordinator'=any(roles) and not 'Academic Instructor'=any(roles))
 or ('RLE Coordinator'=any(roles) and not 'Clinical Instructor'=any(roles))
 or ('Platform Admin'=any(roles) and cardinality(roles)>1) then raise exception 'Invalid fixed account combination'; end if;
 return null;
end $$;
create trigger assignment_lock before insert or update on public.role_assignments for each row execute function f_access_private.assignment_lock();
create trigger membership_lock before insert or update on public.council_memberships for each row execute function f_access_private.assignment_lock();
create constraint trigger assignment_combination after insert or update on public.role_assignments deferrable initially deferred for each row execute function f_access_private.assignment_check();
create constraint trigger membership_combination after insert or update on public.council_memberships deferrable initially deferred for each row execute function f_access_private.assignment_check();
create function f_access_private.semester_lock() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('florence:semester-context',0));
 if TG_OP='DELETE' then raise exception 'Semesters are retained'; end if;
 return new;
end $$;
create trigger semester_context_lock before insert or update or delete on public.semesters for each row execute function f_access_private.semester_lock();

-- Service credits must be inserted while the parent is open; finalization in
-- the same transaction is checked later. This prevents banking/regenerating a
-- zero-credit completion. The parent is locked before the balance trigger.
create function f_access_private.credit_parent_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare s public.service_sessions%rowtype;
begin
 select * into s from public.service_sessions where id=new.session_id for update;
 if not found or s.ended_at is not null or new.issued_by<>s.created_by then
 raise exception 'New credit requires open issuer-owned session'; end if;
 return new;
end $$;
create trigger a_credit_parent before insert on public.service_credits for each row execute function f_access_private.credit_parent_guard();

create function f_access_private.unit_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare zone text; m public.merits%rowtype; e public.merit_endorsements%rowtype;
begin
 if TG_TABLE_NAME='merit_applications' then
  -- Configured only by 003, which is installed after this function. PL/pgSQL
  -- resolves this statement at first execution, not during 002 creation.
  select institutional_timezone into zone from f_cmd_private.settings where singleton;
  if zone is null or not exists(select 1 from pg_timezone_names where name=zone) then raise exception 'Approved institutional timezone required'; end if;
  select * into m from public.merits where id=new.merit_id for update;
  if not found or (new.applied_at at time zone zone)::date<m.awarded_on
   or (new.applied_at at time zone zone)::date>=m.expires_on or new.applied_at>clock_timestamp() then raise exception 'Merit not available at application time'; end if;
 elsif TG_TABLE_NAME='merits' then
  if new.awarded_by=new.student_id then raise exception 'Self merit award forbidden'; end if;
  if new.endorsement_id is not null then
   select * into e from public.merit_endorsements where id=new.endorsement_id for update;
   if not found or e.status<>'pending' or new.awarded_by<>e.assigned_instructor_id
    or new.endorsement_unit_index>e.requested_days then raise exception 'Invalid endorsement award'; end if;
  end if;
 elsif TG_TABLE_NAME='merit_endorsements' then
  if new.submitted_by=new.student_id then raise exception 'Self endorsement forbidden'; end if;
  if new.decided_by is not null and new.decided_by<>new.assigned_instructor_id then raise exception 'Assigned instructor must decide'; end if;
 elsif TG_TABLE_NAME='demerits' then
  if new.issued_by=new.student_id and new.source<>'council' then raise exception 'Self disciplinary entry forbidden'; end if;
 end if;
 return new;
end $$;
-- Alphabetical trigger order retains balance -> merit-unit locking.
create trigger z_unit_check before insert on public.merit_applications for each row execute function f_access_private.unit_guard();
create trigger z_unit_check before insert on public.merits for each row execute function f_access_private.unit_guard();
create trigger z_unit_check before insert or update on public.merit_endorsements for each row execute function f_access_private.unit_guard();
create trigger z_unit_check before insert on public.demerits for each row execute function f_access_private.unit_guard();

-- Unit keys alone do not prove group consistency. Check complete contiguous
-- groups and, for 003-issued operations, the declared count in the retained
-- request receipt. Direct provisioning/import transactions must provide their
-- own declared-count contract when no command receipt exists.
create function f_access_private.ledger_checks() returns trigger
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
    or not exists(select 1 from f_cmd_private.settings cfg where cfg.council_event_bucket=new.bucket) then raise exception 'Council consequence outcome/bucket mismatch'; end if;
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
create constraint trigger complete_units after insert on public.demerits deferrable initially deferred for each row execute function f_access_private.ledger_checks();
create constraint trigger complete_units after insert on public.merits deferrable initially deferred for each row execute function f_access_private.ledger_checks();
create constraint trigger complete_units after insert on public.merit_applications deferrable initially deferred for each row execute function f_access_private.ledger_checks();

create function f_access_private.enrollment_check() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if not exists(select 1 from public.enrollments n where n.student_id=new.student_id and n.semester_id=new.semester_id) then
 raise exception 'Student enrollment in record semester required'; end if;
 return new;
end $$;
do $enrollment$
declare t text;
begin
 foreach t in array array['event_attendance','obligations','payments','demerits','merit_endorsements','merits','service_participants','clearances'] loop
 execute format('create trigger enrollment_required before insert on public.%I for each row execute function f_access_private.enrollment_check()',t);
 end loop;
end $enrollment$;
create function f_access_private.identity_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if TG_OP='DELETE' then raise exception 'Archive identities; do not delete'; end if;
 if new.id<>old.id or new.created_at<>old.created_at then raise exception 'Stable profile identity required'; end if;
 if (new.university_id is null)<>(old.university_id is null) then raise exception 'Student/Faculty identity category cannot change'; end if;
 return new;
end $$;
create trigger identity_retained before update or delete on public.profiles for each row execute function f_access_private.identity_guard();
create trigger enrollment_identity before update or delete on public.enrollments for each row
 execute function f_access_private.history_guard('year_level,academic_status,updated_at');

-- Provisioning views do not confer business-ledger access or disclose Auth links.
create function public.florence_provisioning_directory(p_query text, p_limit integer default 30)
returns table(id uuid, university_id text, email text, first_name text, last_name text, account_status text)
language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 if not (f_access_private.has_role('Platform Admin') or f_access_private.executive()) then raise exception 'Provisioning access denied' using errcode='42501'; end if;
 if p_query is null or length(btrim(p_query))<2 or length(p_query)>100
 or p_limit is null or p_limit not between 1 and 100 then raise exception 'Bounded search required'; end if;
 return query select p.id,p.university_id,p.email,p.first_name,p.last_name,p.account_status
 from public.profiles p where
 ((f_access_private.executive() and p.university_id is not null)
 or (f_access_private.has_role('Platform Admin') and (p.university_id is null or exists(
 select 1 from public.council_memberships c where c.profile_id=p.id and c.access_role='executive'))))
 and (strpos(lower(p.first_name||' '||p.last_name),lower(btrim(p_query)))>0
 or strpos(coalesce(p.university_id,''),btrim(p_query))>0 or strpos(lower(coalesce(p.email,'')),lower(btrim(p_query)))>0)
 order by p.last_name,p.first_name,p.id limit p_limit;
end $$;
revoke all on function public.florence_provisioning_directory(text,integer) from public,anon,authenticated,service_role;
grant execute on function public.florence_provisioning_directory(text,integer) to authenticated;

create function public.florence_instructor_choices()
returns table(id uuid, first_name text, last_name text, instructor_role text)
language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 if not f_access_private.council() then raise exception 'Endorsement lookup denied' using errcode='42501'; end if;
 return query select p.id,p.first_name,p.last_name,r.role from public.profiles p
 join public.role_assignments r on r.profile_id=p.id and r.removed_at is null
 where p.account_status='active' and p.auth_user_id is not null and r.role in ('Academic Instructor','Clinical Instructor')
 order by p.last_name,p.first_name,p.id;
end $$;
revoke all on function public.florence_instructor_choices() from public,anon,authenticated,service_role;
grant execute on function public.florence_instructor_choices() to authenticated;

-- Platform Admin needs an exact-number candidate lookup to grant first-time
-- Executive access, not a bulk student-directory privilege.
create function public.florence_executive_candidate(p_university_id text)
returns table(id uuid, university_id text, first_name text, last_name text, account_status text)
language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 if not f_access_private.has_role('Platform Admin') then raise exception 'Executive provisioning lookup denied' using errcode='42501'; end if;
 if p_university_id is null or p_university_id !~ '^[0-9]{2}-1-[0-9]{5}$' then raise exception 'Exact university number required'; end if;
 return query select p.id,p.university_id,p.first_name,p.last_name,p.account_status from public.profiles p
 where p.university_id=p_university_id and exists(select 1 from public.enrollments n where n.student_id=p.id);
end $$;
create function public.florence_invitation_statuses(p_profile uuid)
returns table(id uuid, status text, email text, expires_at timestamptz, created_at timestamptz, accepted_at timestamptz, cancelled_at timestamptz)
language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 if not exists(select 1 from public.profiles p where p.id=p_profile and
 ((f_access_private.council() and p.university_id is not null)
 or (f_access_private.has_role('Platform Admin') and (p.university_id is null or exists(
 select 1 from public.council_memberships c where c.profile_id=p.id and c.access_role='executive'))))) then
 raise exception 'Invitation status lookup denied' using errcode='42501'; end if;
 return query select i.id,i.status,i.email,i.expires_at,i.created_at,i.accepted_at,i.cancelled_at
 from public.invitations i where i.profile_id=p_profile order by i.created_at desc,i.id;
end $$;
revoke all on function public.florence_executive_candidate(text),public.florence_invitation_statuses(uuid) from public,anon,authenticated,service_role;
grant execute on function public.florence_executive_candidate(text),public.florence_invitation_statuses(uuid) to authenticated;

create function f_access_private.reference_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if TG_TABLE_NAME='payments' then
  if new.decided_by=new.student_id or (new.method='cash' and new.submitted_by=new.student_id) then raise exception 'Self payment recording/decision forbidden'; end if;
  if new.proof_file_id is not null and not exists(select 1 from public.files f where f.id=new.proof_file_id and f.purpose='payment_proof' and f.uploader_id=new.student_id) then raise exception 'Proof must be the student payment-proof file'; end if;
  if new.method='transfer' and new.supersedes_payment_id is null and not exists(select 1 from public.payment_accounts a where a.id=new.payment_account_id and a.archived_at is null
   and a.label=new.destination_label and a.account_name=new.destination_account_name and a.account_reference=new.destination_account_reference for share) then raise exception 'Active destination snapshot required'; end if;
 elsif TG_TABLE_NAME='payment_accounts' then
  if new.qr_file_id is not null and not exists(select 1 from public.files f where f.id=new.qr_file_id and f.purpose='payment_account_qr') then raise exception 'Invalid payment destination QR purpose'; end if;
 elsif TG_TABLE_NAME='roster_imports' then
  if not exists(select 1 from public.files f where f.id=new.file_id and f.purpose='roster_import') then raise exception 'Invalid roster import file purpose'; end if;
 elsif TG_TABLE_NAME='invitations' then
  if TG_OP='UPDATE' then
   if old.status<>'pending' or new.status='pending' or (to_jsonb(new)-array['status','accepted_at','cancelled_at']) is distinct from (to_jsonb(old)-array['status','accepted_at','cancelled_at']) then raise exception 'Only final invitation transition allowed'; end if;
   if new.status='accepted' and (new.accepted_at>=new.expires_at or new.accepted_at<new.created_at or new.expires_at<=clock_timestamp()) then raise exception 'Invitation expired or invalid acceptance time'; end if;
  elsif new.status<>'pending' then raise exception 'New invitation must be pending'; end if;
 elsif TG_TABLE_NAME='notifications' then
  if new.kind not in ('merit_received','demerit_incurred','service_recorded','obligation_due','payment_verified','payment_rejected')
   or new.target_type is not null then raise exception 'Unapproved notification category/navigation'; end if;
 end if;
 return new;
end $$;
create trigger payment_reference_check before insert on public.payments for each row execute function f_access_private.reference_guard();
create trigger destination_file_check before insert or update on public.payment_accounts for each row execute function f_access_private.reference_guard();
create trigger import_file_check before insert or update on public.roster_imports for each row execute function f_access_private.reference_guard();
create trigger invitation_transition before insert or update on public.invitations for each row execute function f_access_private.reference_guard();
create trigger invitation_retained before delete on public.invitations for each row execute function f_access_private.append_only();
create trigger notification_allowlist before insert or update on public.notifications for each row execute function f_access_private.reference_guard();

-- Trigger-only functions were created after the read-helper ACL block. No API
-- role (including service_role) may invoke these definer helpers directly.
do $acl$
declare f record;
begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='f_access_private' and p.prorettype='pg_catalog.trigger'::regtype loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.sig);
 end loop;
end $acl$;
commit;
