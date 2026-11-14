-- Wrap row-independent access helpers as scalar subqueries in read policies.
-- Security-definer SQL functions are not inlined, so a bare call can run once
-- per row; `(select f())` becomes an InitPlan evaluated once per statement.
-- Row visibility is unchanged. event_visible(id) and session_visible(id) take
-- the row's id and stay per-row.

alter policy clearances_read on public.clearances using (
  student_id = (select f_access_private.me())
  or (select f_access_private.council())
  or (select f_access_private.coordinator()));

alter policy memberships_read on public.council_memberships using (
  profile_id = (select f_access_private.me())
  or (select f_access_private.executive())
  or (select f_access_private.has_role('Platform Admin')));

alter policy demerits_read on public.demerits using (
  student_id = (select f_access_private.me())
  or (select f_access_private.coordinator())
  or (source = 'council' and (select f_access_private.council()))
  or (issued_by = (select f_access_private.me()) and (select f_access_private.faculty())));

alter policy enrollment_read on public.enrollments using (
  student_id = (select f_access_private.me())
  or (select f_access_private.council())
  or (select f_access_private.faculty()));

alter policy attendance_read on public.event_attendance using (
  student_id = (select f_access_private.me())
  or (select f_access_private.council(true)));

alter policy rules_read on public.event_consequence_rules using (
  (select f_access_private.council()));

alter policy feedback_read on public.event_feedback using (
  student_id = (select f_access_private.me())
  or (select f_access_private.council()));

alter policy fees_read on public.fee_definitions using (
  (select f_access_private.council()));

alter policy publications_read on public.fee_publications using (
  (select f_access_private.council()));

alter policy fines_read on public.fine_definitions using (
  (select f_access_private.council()));

alter policy applications_read on public.merit_applications using (
  student_id = (select f_access_private.me())
  or (select f_access_private.coordinator()));

alter policy endorsements_read on public.merit_endorsements using (
  student_id = (select f_access_private.me())
  or (select f_access_private.council())
  or (select f_access_private.coordinator())
  or (assigned_instructor_id = (select f_access_private.me()) and (select f_access_private.faculty())));

alter policy merits_read on public.merits using (
  student_id = (select f_access_private.me())
  or (select f_access_private.coordinator())
  or (source = 'endorsement' and (select f_access_private.council()))
  or (awarded_by = (select f_access_private.me()) and (select f_access_private.faculty())));

alter policy catalog_read on public.misconduct_catalog using (
  (select f_access_private.faculty())
  or (select f_access_private.has_role('Platform Admin')));

alter policy notifications_read on public.notifications using (
  recipient_id = (select f_access_private.me()));

alter policy obligations_read on public.obligations using (
  student_id = (select f_access_private.me())
  or (select f_access_private.council()));

alter policy accounts_read on public.payment_accounts using (
  (select f_access_private.executive())
  or (archived_at is null and (select f_access_private.student())));

alter policy items_read on public.payment_items using (
  student_id = (select f_access_private.me())
  or (select f_access_private.council()));

alter policy receipts_read on public.payment_receipts using (
  (select f_access_private.council())
  or exists (select 1 from public.payments p
    where p.receipt_id = payment_receipts.id
      and p.student_id = (select f_access_private.me())));

alter policy refunds_read on public.payment_refunds using (
  (select f_access_private.council())
  or exists (select 1 from public.payments p
    where p.id = payment_refunds.payment_id
      and p.student_id = (select f_access_private.me())));

alter policy payments_read on public.payments using (
  student_id = (select f_access_private.me())
  or (select f_access_private.council()));

alter policy own_profile on public.profiles using (
  id = (select f_access_private.me()));

alter policy assignments_read on public.role_assignments using (
  profile_id = (select f_access_private.me())
  or (select f_access_private.has_role('Platform Admin')));

alter policy imports_read on public.roster_imports using (
  (select f_access_private.council()));

alter policy semesters_read on public.semesters using (
  (select f_access_private.me()) is not null);

alter policy credits_read on public.service_credits using (
  student_id = (select f_access_private.me())
  or (select f_access_private.coordinator())
  or (issued_by = (select f_access_private.me()) and (select f_access_private.faculty())));

alter policy participants_read on public.service_participants using (
  student_id = (select f_access_private.me())
  or (select f_access_private.coordinator())
  or exists (select 1 from public.service_sessions s
    where s.id = service_participants.session_id
      and s.created_by = (select f_access_private.me())
      and (select f_access_private.faculty())));
