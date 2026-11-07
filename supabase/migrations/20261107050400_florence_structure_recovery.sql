-- Project Florence schema 0.5 (2026-11-07): FRESH-INSTALL HANDOFF ONLY.
-- Not an applied migration, upgrade, or companion to the retained root SQL files.
-- Requires PostgreSQL 14+ / Supabase roles anon and authenticated and public schema.
-- Run only against a reviewed fresh application namespace; collisions fail closed.
-- No resets, drops, seeds, policies, RPCs, triggers or workflow implementation here.
-- Structure alone is NOT workflow-ready. Service-role access bypasses RLS.
-- All protected commands still require server authorization, transaction atomicity,
-- actor derivation, shared parent/receipt/obligation/balance locking and retry checks.
-- UUID defaults apply only to row identities, never operation/group/request keys.
-- created_at defaults to transaction time; other timestamps are supplied explicitly.
-- updated_at is application-maintained (no automatic update trigger).
--
-- Physical choices permitted by the accepted schema:
-- * roster_imports.request_key identifies an import apply operation.
-- * demerits.incident_unit_index numbers each incident's units; incident_group_id
--   is the caller-retained operation key. Do not regenerate it on retries.
-- * merits.award_request_key + award_unit_index identify direct/external awards.
-- * payment_items carries student_id/semester_id for matching composite FKs.
-- * service_participants carries semester_id/bucket, and service_credits carries
--   session_id, so the complete participant/session/student/context chain agrees.
--
-- TODO before workflows ship (not claims of enforcement by this structure):
-- 1. Confirm semester term vocabulary (no Midyear assumed); until then term is
--    nonblank checked text. Confirm institutional timezone before adding same-duty-
--    day service checks. Verify single-name exceptions before roster deployment.
-- 2. Define notification kind/target_type allowlists, questionnaire JSON shape,
--    bounded import summary, MIME/size limits and transfer evidence requirements.
--    Transfer destination snapshots/account are required here; reference/proof
--    optionality remains explicitly unresolved, not presumed safe for submission.
-- 3. Implement feature-scoped read policies/projections/grants, archived-profile
--    denial, private-storage authorization and server-only command/RPC ACLs.
-- 4. Implement immutable history/finalization, audience snapshot/configuration
--    freezing, required event windows and frozen fine amounts under event locks.
--    Before freeze a selected fine may have no amount; after freeze it may not.
-- 5. Implement complete-unit/count commits, matching retry payload validation,
--    group context consistency, merit election retry reconstruction and expiry/
--    balance validation. Unique keys prevent duplicate units, not partial commits.
-- 6. Implement finance totals/full items/no double settlement, receipt existence
--    with exactly one authoritative representation, manual transfer deduplication,
--    full refund/rejection rules and correction cycle/history protections. The
--    correction FK preserves receipt/beneficiary/context; amount/refund consistency
--    and current-target/superseded-predecessor transitions require transactions.
-- 7. Implement attendance-window validation, no-self-benefit checks, applicable
--    role/bucket checks, clearance prerequisites/permanence and notification safety.
--    Cross-row rules and immutable facts are not enforced by ordinary CHECKs.
-- Tests, seeds, live application and database deployment are explicitly deferred.

begin;

create type public.bucket as enum ('office', 'rle');
create type public.council_access_role as enum ('executive', 'operations', 'representative');
create type public.academic_status as enum ('regular', 'irregular');

create table public.profiles (
    id uuid primary key default gen_random_uuid(),
    auth_user_id uuid unique,
    university_id text unique check (university_id ~ '^[0-9]{2}-1-[0-9]{5}$'),
    email text,
    first_name text not null check (btrim(first_name) <> ''),
    middle_name text check (btrim(middle_name) <> ''),
    last_name text not null check (btrim(last_name) <> ''),
    suffix text check (btrim(suffix) <> ''),
    account_status text not null check (account_status in ('active', 'archived')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null
);
-- auth_user_id is an external link, intentionally not a cascading Auth FK.
-- Auth unlinking is an authorized update to NULL; Florence history is retained.
-- Email is not a unique domain identity. Names are neither parsed nor normalized here.

create table public.role_assignments (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references public.profiles on delete restrict,
    role text not null check (role in ('Academic Instructor', 'Clinical Instructor',
        'Academic Coordinator', 'RLE Coordinator', 'Platform Admin')),
    assigned_by uuid not null references public.profiles on delete restrict,
    assigned_at timestamptz not null,
    removed_by uuid references public.profiles on delete restrict,
    removed_at timestamptz,
    check ((removed_by is null) = (removed_at is null))
);
create unique index role_assignments_active_unique on public.role_assignments (profile_id, role)
    where removed_at is null;

create table public.council_memberships (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references public.profiles on delete restrict,
    access_role public.council_access_role not null,
    position_label text not null check (btrim(position_label) <> ''),
    assigned_by uuid not null references public.profiles on delete restrict,
    assigned_at timestamptz not null,
    removed_by uuid references public.profiles on delete restrict,
    removed_at timestamptz,
    check ((removed_by is null) = (removed_at is null))
);
create unique index council_memberships_active_unique on public.council_memberships (profile_id)
    where removed_at is null;

create table public.invitations (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references public.profiles on delete restrict,
    email text not null check (btrim(email) <> ''),
    status text not null check (status in ('pending', 'accepted', 'expired', 'cancelled')),
    token_hash text not null unique check (btrim(token_hash) <> ''),
    expires_at timestamptz not null,
    created_by uuid not null references public.profiles on delete restrict,
    created_at timestamptz not null default now(),
    accepted_at timestamptz,
    cancelled_at timestamptz,
    check (expires_at > created_at),
    check ((status = 'accepted') = (accepted_at is not null)),
    check ((status = 'cancelled') = (cancelled_at is not null))
);

create table public.semesters (
    id uuid primary key default gen_random_uuid(),
    academic_year_start integer not null check (academic_year_start between 1900 and 9998),
    term text not null check (btrim(term) <> ''), -- TODO: approved term allowlist.
    starts_on date not null,
    ends_on date not null,
    is_current boolean not null,
    created_by uuid not null references public.profiles on delete restrict,
    created_at timestamptz not null default now(),
    unique (academic_year_start, term),
    check (ends_on >= starts_on)
);
create unique index semesters_one_current on public.semesters (is_current) where is_current;

create table public.enrollments (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null references public.profiles on delete restrict,
    semester_id uuid not null references public.semesters on delete restrict,
    year_level smallint not null check (year_level between 1 and 4),
    academic_status public.academic_status not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null,
    unique (student_id, semester_id)
);

create table public.files (
    id uuid primary key default gen_random_uuid(),
    uploader_id uuid not null references public.profiles on delete restrict,
    purpose text not null check (purpose in ('roster_import', 'payment_proof', 'payment_account_qr')),
    storage_key text not null unique check (btrim(storage_key) <> ''),
    media_type text not null check (btrim(media_type) <> ''),
    byte_size bigint not null check (byte_size > 0),
    created_at timestamptz not null default now()
);

create table public.roster_imports (
    id uuid primary key default gen_random_uuid(),
    request_key uuid not null unique,
    semester_id uuid not null references public.semesters on delete restrict,
    file_id uuid not null references public.files on delete restrict,
    status text not null check (status in ('validated', 'applied', 'failed')),
    summary jsonb check (jsonb_typeof(summary) = 'object'),
    created_by uuid not null references public.profiles on delete restrict,
    created_at timestamptz not null default now(),
    applied_at timestamptz,
    check ((status = 'applied') = (applied_at is not null))
);

create table public.events (
    id uuid primary key default gen_random_uuid(),
    semester_id uuid not null references public.semesters on delete restrict,
    name text not null check (btrim(name) <> ''),
    venue text,
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    time_in_from timestamptz,
    time_in_until timestamptz,
    time_out_from timestamptz,
    time_out_until timestamptz,
    late_after_minutes integer not null check (late_after_minutes >= 0),
    year_levels smallint[] not null,
    academic_statuses text[] not null,
    audience_frozen_at timestamptz,
    attendance_locked_at timestamptz,
    archived_at timestamptz,
    created_by uuid not null references public.profiles on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null,
    unique (id, semester_id),
    check (ends_at > starts_at),
    check ((time_in_from is null) = (time_in_until is null)),
    check ((time_out_from is null) = (time_out_until is null)),
    check (time_in_until >= time_in_from),
    check (time_out_until >= time_out_from),
    check (cardinality(year_levels) > 0 and array_ndims(year_levels) = 1
        and array_position(year_levels, null) is null and year_levels <@ array[1,2,3,4]::smallint[]),
    check (cardinality(academic_statuses) > 0 and array_ndims(academic_statuses) = 1
        and array_position(academic_statuses, null) is null
        and academic_statuses <@ array['regular','irregular']::text[]),
    check (attendance_locked_at is null or audience_frozen_at is not null)
);

create table public.fee_definitions (
    id uuid primary key default gen_random_uuid(),
    name text not null check (btrim(name) <> ''),
    amount numeric(12,2) not null check (amount > 0 and amount <> 'NaN'::numeric),
    archived_at timestamptz,
    created_by uuid not null references public.profiles on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null
);
create table public.fine_definitions (
    id uuid primary key default gen_random_uuid(),
    name text not null check (btrim(name) <> ''),
    amount numeric(12,2) not null check (amount > 0 and amount <> 'NaN'::numeric),
    archived_at timestamptz,
    created_by uuid not null references public.profiles on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null
);

create table public.event_consequence_rules (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null unique references public.events on delete restrict,
    absence_fine_definition_id uuid references public.fine_definitions on delete restrict,
    late_fine_definition_id uuid references public.fine_definitions on delete restrict,
    absence_demerit_days integer not null check (absence_demerit_days >= 0),
    late_demerit_days integer not null check (late_demerit_days >= 0),
    absence_fine_amount numeric(12,2) check (absence_fine_amount > 0 and absence_fine_amount <> 'NaN'::numeric),
    late_fine_amount numeric(12,2) check (late_fine_amount > 0 and late_fine_amount <> 'NaN'::numeric),
    requires_time_in boolean not null check (requires_time_in),
    requires_time_out boolean not null,
    check (absence_fine_amount is null or absence_fine_definition_id is not null),
    check (late_fine_amount is null or late_fine_definition_id is not null)
);
-- Required definition/amount pairing at freeze and rule/window agreement span tables.

create table public.event_attendance (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null,
    student_id uuid not null references public.profiles on delete restrict,
    semester_id uuid not null,
    year_level_snapshot smallint not null check (year_level_snapshot between 1 and 4),
    academic_status_snapshot public.academic_status not null,
    time_in timestamptz,
    time_out timestamptz,
    time_in_method text check (time_in_method in ('qr', 'manual', 'csv')),
    time_out_method text check (time_out_method in ('qr', 'manual', 'csv')),
    time_in_recorded_by uuid references public.profiles on delete restrict,
    time_out_recorded_by uuid references public.profiles on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null,
    unique (event_id, student_id),
    unique (id, student_id, semester_id),
    foreign key (event_id, semester_id) references public.events (id, semester_id) on delete restrict,
    check (time_out is null or (time_in is not null and time_out > time_in)),
    check ((time_in is null) = (time_in_method is null)),
    check ((time_in is null) = (time_in_recorded_by is null)),
    check ((time_out is null) = (time_out_method is null)),
    check ((time_out is null) = (time_out_recorded_by is null))
);

create table public.event_feedback (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null,
    student_id uuid not null,
    responses jsonb not null check (jsonb_typeof(responses) = 'object'),
    submitted_at timestamptz not null,
    unique (event_id, student_id),
    foreign key (event_id, student_id) references public.event_attendance (event_id, student_id) on delete restrict
);

create table public.fee_publications (
    id uuid primary key default gen_random_uuid(),
    request_key uuid not null unique,
    fee_definition_id uuid not null references public.fee_definitions on delete restrict,
    semester_id uuid not null references public.semesters on delete restrict,
    year_levels smallint[] not null,
    academic_statuses text[] not null,
    description text not null check (btrim(description) <> ''),
    amount numeric(12,2) not null check (amount > 0 and amount <> 'NaN'::numeric),
    published_by uuid not null references public.profiles on delete restrict,
    published_at timestamptz not null,
    unique (id, fee_definition_id, semester_id),
    check (cardinality(year_levels) > 0 and array_ndims(year_levels) = 1
        and array_position(year_levels, null) is null and year_levels <@ array[1,2,3,4]::smallint[]),
    check (cardinality(academic_statuses) > 0 and array_ndims(academic_statuses) = 1
        and array_position(academic_statuses, null) is null
        and academic_statuses <@ array['regular','irregular']::text[])
);

create table public.obligations (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null references public.profiles on delete restrict,
    semester_id uuid not null references public.semesters on delete restrict,
    kind text not null check (kind in ('fee', 'fine')),
    fee_definition_id uuid,
    fee_publication_id uuid,
    consequence_outcome text check (consequence_outcome in ('absence', 'late')),
    event_attendance_id uuid,
    description text not null check (btrim(description) <> ''),
    amount numeric(12,2) not null check (amount > 0 and amount <> 'NaN'::numeric),
    waived_at timestamptz,
    waived_by uuid references public.profiles on delete restrict,
    waiver_reason text check (btrim(waiver_reason) <> ''),
    created_at timestamptz not null default now(),
    unique (id, student_id, semester_id),
    foreign key (fee_publication_id, fee_definition_id, semester_id)
        references public.fee_publications (id, fee_definition_id, semester_id) on delete restrict,
    foreign key (event_attendance_id, student_id, semester_id)
        references public.event_attendance (id, student_id, semester_id) on delete restrict,
    check ((kind = 'fee' and fee_definition_id is not null and fee_publication_id is not null
            and event_attendance_id is null and consequence_outcome is null)
        or (kind = 'fine' and fee_definition_id is null and fee_publication_id is null
            and event_attendance_id is not null and consequence_outcome is not null)),
    check ((waived_at is null) = (waived_by is null)),
    check ((waived_at is null) = (waiver_reason is null))
);
create unique index obligations_fee_unique on public.obligations (fee_definition_id, student_id, semester_id)
    where kind = 'fee';
create unique index obligations_fine_unique on public.obligations (event_attendance_id, consequence_outcome)
    where kind = 'fine';

create table public.payment_accounts (
    id uuid primary key default gen_random_uuid(),
    label text not null check (btrim(label) <> ''),
    account_name text not null check (btrim(account_name) <> ''),
    account_reference text not null check (btrim(account_reference) <> ''),
    instructions text,
    qr_file_id uuid references public.files on delete restrict,
    archived_at timestamptz,
    created_by uuid not null references public.profiles on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null
);

create table public.payment_receipts (
    id uuid primary key default gen_random_uuid(),
    request_key uuid not null unique,
    received_at timestamptz not null,
    recognized_by uuid not null references public.profiles on delete restrict,
    created_at timestamptz not null default now()
);

create table public.payments (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null references public.profiles on delete restrict,
    semester_id uuid not null references public.semesters on delete restrict,
    method text not null check (method in ('transfer', 'cash')),
    status text not null check (status in ('pending', 'verified', 'rejected')),
    record_status text not null check (record_status in ('current', 'superseded')),
    request_key uuid not null unique,
    receipt_id uuid references public.payment_receipts on delete restrict,
    is_receipt_record boolean not null,
    payment_account_id uuid references public.payment_accounts on delete restrict,
    destination_label text check (btrim(destination_label) <> ''),
    destination_account_name text check (btrim(destination_account_name) <> ''),
    destination_account_reference text check (btrim(destination_account_reference) <> ''),
    reference_number text check (btrim(reference_number) <> ''),
    proof_file_id uuid references public.files on delete restrict,
    amount numeric(12,2) not null check (amount > 0 and amount <> 'NaN'::numeric),
    submitted_by uuid not null references public.profiles on delete restrict,
    submitted_at timestamptz not null,
    decided_by uuid references public.profiles on delete restrict,
    decided_at timestamptz,
    decision_reason text check (btrim(decision_reason) <> ''),
    supersedes_payment_id uuid,
    created_at timestamptz not null default now(),
    unique (id, receipt_id),
    unique (id, student_id, semester_id),
    unique (id, receipt_id, student_id, semester_id),
    foreign key (supersedes_payment_id, receipt_id, student_id, semester_id)
        references public.payments (id, receipt_id, student_id, semester_id) on delete restrict,
    check (supersedes_payment_id is distinct from id),
    check (supersedes_payment_id is null or (receipt_id is not null and decision_reason is not null)),
    check (not is_receipt_record or receipt_id is not null),
    check (status <> 'verified' or (is_receipt_record and receipt_id is not null)),
    check (status <> 'pending' or (receipt_id is null and not is_receipt_record)),
    check ((status = 'pending') = (decided_at is null)),
    check ((decided_at is null) = (decided_by is null)),
    check (status <> 'rejected' or decision_reason is not null),
    check ((method = 'cash' and status = 'verified' and payment_account_id is null
            and destination_label is null and destination_account_name is null
            and destination_account_reference is null and reference_number is null and proof_file_id is null)
        or (method = 'transfer' and payment_account_id is not null and destination_label is not null
            and destination_account_name is not null and destination_account_reference is not null))
);
create unique index payments_successor_unique on public.payments (supersedes_payment_id)
    where supersedes_payment_id is not null;
create unique index payments_current_receipt_unique on public.payments (receipt_id)
    where is_receipt_record and record_status = 'current';

create table public.payment_items (
    id uuid primary key default gen_random_uuid(),
    payment_id uuid not null,
    obligation_id uuid not null,
    student_id uuid not null,
    semester_id uuid not null,
    amount numeric(12,2) not null check (amount > 0 and amount <> 'NaN'::numeric),
    unique (payment_id, obligation_id),
    foreign key (payment_id, student_id, semester_id)
        references public.payments (id, student_id, semester_id) on delete restrict,
    foreign key (obligation_id, student_id, semester_id)
        references public.obligations (id, student_id, semester_id) on delete restrict
);

create table public.payment_refunds (
    id uuid primary key default gen_random_uuid(),
    receipt_id uuid not null unique references public.payment_receipts on delete restrict,
    payment_id uuid not null,
    amount numeric(12,2) not null check (amount > 0 and amount <> 'NaN'::numeric),
    reason text not null check (btrim(reason) <> ''),
    recorded_by uuid not null references public.profiles on delete restrict,
    refunded_at timestamptz not null,
    created_at timestamptz not null default now(),
    foreign key (payment_id, receipt_id) references public.payments (id, receipt_id) on delete restrict
);

create table public.misconduct_catalog (
    id uuid primary key default gen_random_uuid(),
    label text not null check (btrim(label) <> ''),
    is_other boolean not null,
    archived_at timestamptz,
    created_by uuid not null references public.profiles on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null
);
create unique index misconduct_catalog_one_active_other on public.misconduct_catalog (is_other)
    where is_other and archived_at is null;
-- Existence of the required Other option is provisioning work, not a seed here.

create table public.demerits (
    id uuid primary key default gen_random_uuid(),
    incident_group_id uuid not null,
    incident_unit_index integer not null check (incident_unit_index > 0),
    student_id uuid not null references public.profiles on delete restrict,
    semester_id uuid not null references public.semesters on delete restrict,
    bucket public.bucket not null,
    source text not null check (source in ('faculty', 'council', 'external_ci')),
    misconduct_id uuid references public.misconduct_catalog on delete restrict,
    description text not null check (btrim(description) <> ''),
    incident_on date not null,
    event_attendance_id uuid,
    consequence_outcome text check (consequence_outcome in ('absence', 'late')),
    source_unit_index integer check (source_unit_index > 0),
    issued_by uuid not null references public.profiles on delete restrict,
    external_source_name text check (btrim(external_source_name) <> ''),
    waived_at timestamptz,
    waived_by uuid references public.profiles on delete restrict,
    waiver_reason text check (btrim(waiver_reason) <> ''),
    created_at timestamptz not null default now(),
    unique (incident_group_id, incident_unit_index),
    foreign key (event_attendance_id, student_id, semester_id)
        references public.event_attendance (id, student_id, semester_id) on delete restrict,
    check ((source = 'council' and event_attendance_id is not null and consequence_outcome is not null
            and source_unit_index is not null and external_source_name is null and misconduct_id is null)
        or (source = 'faculty' and event_attendance_id is null and consequence_outcome is null
            and source_unit_index is null and external_source_name is null)
        or (source = 'external_ci' and event_attendance_id is null and consequence_outcome is null
            and source_unit_index is null and external_source_name is not null)),
    check ((waived_at is null) = (waived_by is null)),
    check ((waived_at is null) = (waiver_reason is null))
);
create unique index demerits_council_unit_unique on public.demerits
    (event_attendance_id, consequence_outcome, source_unit_index) where source = 'council';

create table public.merit_endorsements (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null references public.profiles on delete restrict,
    semester_id uuid not null references public.semesters on delete restrict,
    assigned_instructor_id uuid not null references public.profiles on delete restrict,
    description text not null check (btrim(description) <> ''),
    requested_days integer not null check (requested_days > 0),
    status text not null check (status in ('pending', 'approved', 'rejected')),
    submitted_by uuid not null references public.profiles on delete restrict,
    submitted_at timestamptz not null,
    decided_by uuid references public.profiles on delete restrict,
    decided_at timestamptz,
    decision_reason text check (btrim(decision_reason) <> ''),
    unique (id, student_id, semester_id),
    check ((status = 'pending') = (decided_at is null)),
    check ((decided_at is null) = (decided_by is null))
);
-- Rejection reason remains optional as specified; no new approval rule is imposed.

create table public.merits (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null references public.profiles on delete restrict,
    semester_id uuid not null references public.semesters on delete restrict,
    source text not null check (source in ('direct', 'endorsement', 'external_ci')),
    endorsement_id uuid,
    endorsement_unit_index integer check (endorsement_unit_index > 0),
    award_request_key uuid,
    award_unit_index integer check (award_unit_index > 0),
    description text not null check (btrim(description) <> ''),
    awarded_on date not null,
    expires_on date not null,
    awarded_by uuid not null references public.profiles on delete restrict,
    external_source_name text check (btrim(external_source_name) <> ''),
    created_at timestamptz not null default now(),
    unique (id, student_id),
    unique (endorsement_id, endorsement_unit_index),
    unique (award_request_key, award_unit_index),
    foreign key (endorsement_id, student_id, semester_id)
        references public.merit_endorsements (id, student_id, semester_id) on delete restrict,
    check (expires_on = (awarded_on + interval '1 year')::date),
    check ((source = 'endorsement' and endorsement_id is not null and endorsement_unit_index is not null
            and award_request_key is null and award_unit_index is null and external_source_name is null)
        or (source in ('direct', 'external_ci') and endorsement_id is null and endorsement_unit_index is null
            and award_request_key is not null and award_unit_index is not null
            and ((source = 'external_ci') = (external_source_name is not null))))
);

create table public.merit_applications (
    id uuid primary key default gen_random_uuid(),
    application_group_id uuid not null,
    student_id uuid not null,
    merit_id uuid not null unique,
    bucket public.bucket not null,
    applied_at timestamptz not null,
    foreign key (merit_id, student_id) references public.merits (id, student_id) on delete restrict
);

create table public.service_sessions (
    id uuid primary key default gen_random_uuid(),
    semester_id uuid not null references public.semesters on delete restrict,
    bucket public.bucket not null,
    duty_on date not null,
    scheduled_start timestamptz not null,
    scheduled_end timestamptz not null,
    location text,
    late_after_minutes integer not null check (late_after_minutes >= 0),
    time_in_from timestamptz not null,
    time_in_until timestamptz not null,
    time_out_from timestamptz not null,
    time_out_until timestamptz not null,
    created_by uuid not null references public.profiles on delete restrict,
    ended_by uuid references public.profiles on delete restrict,
    ended_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null,
    unique (id, semester_id, bucket),
    check (scheduled_end > scheduled_start),
    check (time_in_until >= time_in_from),
    check (time_out_until >= time_out_from),
    check ((ended_by is null) = (ended_at is null))
);

create table public.service_participants (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null,
    student_id uuid not null references public.profiles on delete restrict,
    semester_id uuid not null,
    bucket public.bucket not null,
    time_in timestamptz,
    time_out timestamptz,
    recorded_by uuid references public.profiles on delete restrict,
    excluded_at timestamptz,
    excluded_by uuid references public.profiles on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null,
    unique (session_id, student_id),
    unique (id, student_id),
    unique (id, student_id, session_id, semester_id, bucket),
    foreign key (session_id, semester_id, bucket)
        references public.service_sessions (id, semester_id, bucket) on delete restrict,
    check (time_out is null or (time_in is not null and time_out > time_in)),
    check ((excluded_at is null) = (excluded_by is null))
);

create table public.service_credits (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null,
    semester_id uuid not null,
    bucket public.bucket not null,
    session_id uuid not null,
    service_participant_id uuid not null unique,
    issued_by uuid not null references public.profiles on delete restrict,
    issued_at timestamptz not null,
    revoked_by uuid references public.profiles on delete restrict,
    revoked_at timestamptz,
    revocation_reason text check (btrim(revocation_reason) <> ''),
    foreign key (service_participant_id, student_id, session_id, semester_id, bucket)
        references public.service_participants (id, student_id, session_id, semester_id, bucket) on delete restrict,
    check ((revoked_at is null) = (revoked_by is null)),
    check ((revoked_at is null) = (revocation_reason is null))
);

create table public.clearances (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null references public.profiles on delete restrict,
    semester_id uuid not null references public.semesters on delete restrict,
    component text not null check (component in ('council', 'academic', 'rle')),
    confirmed_by uuid not null references public.profiles on delete restrict,
    confirmed_at timestamptz not null,
    unique (student_id, semester_id, component)
);

create table public.notifications (
    id uuid primary key default gen_random_uuid(),
    recipient_id uuid not null references public.profiles on delete restrict,
    kind text not null check (btrim(kind) <> ''), -- TODO: safe category allowlist.
    message text not null check (btrim(message) <> ''),
    target_type text check (btrim(target_type) <> ''), -- TODO: navigation allowlist.
    target_id uuid,
    read_at timestamptz,
    created_at timestamptz not null default now(),
    check ((target_type is null) = (target_id is null)),
    check (read_at is null or read_at >= created_at)
);
-- Polymorphic navigation targets are not fabricated relational foreign keys.

-- Known V1 query indexes; unique constraints already supply their own indexes.
create index enrollments_roster_idx on public.enrollments (semester_id, year_level, academic_status);
create index events_schedule_idx on public.events (semester_id, starts_at);
create index obligations_student_idx on public.obligations (student_id, semester_id);
create index payments_student_status_idx on public.payments (student_id, semester_id, status);
create index payment_items_obligation_idx on public.payment_items (obligation_id);
create index demerits_student_bucket_idx on public.demerits (student_id, semester_id, bucket);
create index merits_expiry_idx on public.merits (student_id, expires_on);
create index merit_applications_student_idx on public.merit_applications (student_id, bucket, applied_at);
create index merit_applications_group_idx on public.merit_applications (application_group_id);
create index service_sessions_schedule_idx on public.service_sessions (semester_id, bucket, duty_on);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);

-- Default-deny baseline is deliberately limited to these newly created objects.
-- No schema-wide/default-privilege modifications and no ordinary SELECT grants.
-- No policies means RLS denies all ordinary user-context row access. Table owners
-- and BYPASSRLS roles still bypass it; FORCE RLS would not constrain service_role.
alter table public.profiles enable row level security;
alter table public.role_assignments enable row level security;
alter table public.council_memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.semesters enable row level security;
alter table public.enrollments enable row level security;
alter table public.files enable row level security;
alter table public.roster_imports enable row level security;
alter table public.events enable row level security;
alter table public.fee_definitions enable row level security;
alter table public.fine_definitions enable row level security;
alter table public.event_consequence_rules enable row level security;
alter table public.event_attendance enable row level security;
alter table public.event_feedback enable row level security;
alter table public.fee_publications enable row level security;
alter table public.obligations enable row level security;
alter table public.payment_accounts enable row level security;
alter table public.payment_receipts enable row level security;
alter table public.payments enable row level security;
alter table public.payment_items enable row level security;
alter table public.payment_refunds enable row level security;
alter table public.misconduct_catalog enable row level security;
alter table public.demerits enable row level security;
alter table public.merit_endorsements enable row level security;
alter table public.merits enable row level security;
alter table public.merit_applications enable row level security;
alter table public.service_sessions enable row level security;
alter table public.service_participants enable row level security;
alter table public.service_credits enable row level security;
alter table public.clearances enable row level security;
alter table public.notifications enable row level security;

revoke all privileges on table
    public.profiles, public.role_assignments, public.council_memberships,
    public.invitations, public.semesters, public.enrollments, public.files,
    public.roster_imports, public.events, public.fee_definitions, public.fine_definitions,
    public.event_consequence_rules, public.event_attendance, public.event_feedback,
    public.fee_publications, public.obligations, public.payment_accounts,
    public.payment_receipts, public.payments, public.payment_items, public.payment_refunds,
    public.misconduct_catalog, public.demerits, public.merit_endorsements, public.merits,
    public.merit_applications, public.service_sessions, public.service_participants,
    public.service_credits, public.clearances, public.notifications
from public, anon, authenticated;

revoke all privileges on type public.bucket, public.council_access_role, public.academic_status
from public, anon, authenticated;
-- Feature handoffs must grant necessary type usage together with safe read access.
-- Server role privileges must be reviewed at deployment; no broad server grants
-- are added here and no inherited service-role privileges imply authorization.

commit;
