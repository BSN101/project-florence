import "server-only";

import { z } from "zod";

import { displayName } from "@/lib/format-name";
import { AccessDeniedError, requireWorkspace } from "@/server/auth/require-workspace";
import { createUserClient } from "@/server/db/user-client";

import { calculateDisciplinarySummary, evaluateMeritState, getAvailableMeritsFifo, getTodayManila } from "./calculations";
import type {
  StudentMeritApplicationGroup,
  CouncilDisciplinaryViewData,
  DisciplinaryBucket,
  DisciplinaryLedger,
  FacultyDemeritGroup,
  FacultyDisciplinaryViewData,
  FacultyMeritGroup,
  InstructorChoice,
  MisconductOption,
  StudentDisciplinarySummary,
} from "./contracts";

type UserClient = Awaited<ReturnType<typeof createUserClient>>;

const DEMERIT_COLUMNS =
  "id, incident_group_id, incident_unit_index, student_id, semester_id, bucket, source, misconduct_id, description, incident_on, event_attendance_id, consequence_outcome, source_unit_index, issued_by, external_source_name, waived_at, waived_by, waiver_reason, created_at, misconduct:misconduct_catalog(label)";
const MERIT_COLUMNS =
  "id, student_id, semester_id, source, endorsement_id, endorsement_unit_index, description, awarded_on, expires_on, awarded_by, external_source_name, created_at";
const CREDIT_COLUMNS =
  "id, student_id, semester_id, bucket, service_participant_id, issued_by, issued_at, revoked_by, revoked_at, revocation_reason";

type NameRow = { id: string; university_id: string | null; first_name: string; middle_name: string | null; last_name: string; suffix: string | null };

/** Names for people on rows the caller can read; `own_profile` RLS blocks embedded profile joins. */
async function loadNames(client: UserClient, ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((id): id is string => id !== null))];
  const names = new Map<string, NameRow>();
  if (unique.length === 0) return names;
  const { data, error } = await client.rpc("florence_discipline_names", { p_ids: unique });
  if (error) throw new Error("Unable to load names");
  for (const row of data) names.set(row.id, row);
  return names;
}

function nameOf(names: Map<string, NameRow>, id: string | null) {
  const row = id ? names.get(id) : undefined;
  return row ? displayName(row) : null;
}

// Council actors are students; display "Council" instead of their names. `issued_by` /
// `waived_by` / `submitted_by` still carry the actual actors for attribution.
const COUNCIL = "Council";

function toDemerit<T extends { source: string; issued_by: string; waived_by: string | null; misconduct: { label: string } | null }>(
  { misconduct, ...d }: T,
  names: Map<string, NameRow>
) {
  const council = d.source === "council";
  return {
    ...d,
    misconduct_label: misconduct?.label ?? null,
    issuer_name: council ? COUNCIL : nameOf(names, d.issued_by),
    waived_by_name: council ? (d.waived_by ? COUNCIL : null) : nameOf(names, d.waived_by),
  };
}

/** Actor ids whose names a demerit row displays (none for Council rows). */
const demeritActors = (d: { source: string; issued_by: string; waived_by: string | null }) =>
  d.source === "council" ? [] : [d.issued_by, d.waived_by];

/**
 * One student's ledger. With `issuerId`, only entries that actor issued and no
 * applications or summary (ordinary instructors, FL-029); otherwise the full ledger.
 */
async function loadLedger(
  studentId: string,
  issuerId?: string
): Promise<DisciplinaryLedger & { summary: StudentDisciplinarySummary | null }> {
  const client = await createUserClient();
  const today = getTodayManila();

  let demeritsQuery = client.from("demerits").select(DEMERIT_COLUMNS).eq("student_id", studentId);
  let meritsQuery = client.from("merits").select(MERIT_COLUMNS).eq("student_id", studentId);
  let creditsQuery = client.from("service_credits").select(CREDIT_COLUMNS).eq("student_id", studentId);
  if (issuerId) {
    demeritsQuery = demeritsQuery.eq("issued_by", issuerId);
    meritsQuery = meritsQuery.eq("awarded_by", issuerId);
    creditsQuery = creditsQuery.eq("issued_by", issuerId);
  }

  const [demeritsRes, meritsRes, creditsRes, applicationsRes] = await Promise.all([
    demeritsQuery.order("incident_on", { ascending: false }),
    meritsQuery.order("awarded_on", { ascending: false }),
    creditsQuery.order("issued_at", { ascending: false }),
    issuerId
      ? null
      : client
          .from("merit_applications")
          .select("id, application_group_id, student_id, merit_id, bucket, applied_at")
          .eq("student_id", studentId),
  ]);
  if (demeritsRes.error) throw new Error("Unable to load demerits");
  if (meritsRes.error) throw new Error("Unable to load merits");
  if (creditsRes.error) throw new Error("Unable to load service credits");
  if (applicationsRes?.error) throw new Error("Unable to load merit applications");

  const names = await loadNames(client, [
    ...demeritsRes.data.flatMap(demeritActors),
    ...meritsRes.data.map((m) => m.awarded_by),
    ...creditsRes.data.map((c) => c.issued_by),
  ]);
  const applications = applicationsRes?.data ?? [];
  const appliedMeritIds = new Set(applications.map((a) => a.merit_id));
  const appliedBuckets = new Map<string, DisciplinaryBucket>();
  if (!issuerId) {
    for (const a of applications) {
      appliedBuckets.set(a.merit_id, a.bucket);
    }
  }

  const demerits = demeritsRes.data.map((d) => toDemerit(d, names));
  const merits = meritsRes.data.map((m) => {
    const record = { ...m, awarder_name: nameOf(names, m.awarded_by) };
    if (issuerId) return record;
    const { isApplied, isExpired } = evaluateMeritState(m, appliedMeritIds, today);
    const appliedBucket = isApplied ? appliedBuckets.get(m.id) ?? null : null;
    return { ...record, isApplied, isExpired, appliedBucket };
  });
  const serviceCredits = creditsRes.data.map((c) => ({ ...c, issuer_name: nameOf(names, c.issued_by) }));

  const summary = issuerId
    ? null
    : calculateDisciplinarySummary({ demerits, merits, applications, serviceCredits, asOfDate: today });
  return { summary, demerits, merits, serviceCredits };
}

/**
 * Access guard for Council disciplinary routes (FL-029).
 * Restricts access to Council Executive and Operations. Representatives are strictly denied.
 */
export async function requireCouncilDisciplinaryViewer() {
  const context = await requireWorkspace("council");
  if (context.councilRole !== "executive" && context.councilRole !== "operations") {
    throw new AccessDeniedError("forbidden");
  }
  return context;
}

/**
 * Student workspace query (FL-029). Balances are cumulative across semesters;
 * only the listed records are narrowed to `semesterId`.
 * Evaluates available merits across the complete cross-semester ledger.
 */
export async function getMyDisciplinaryRecords(semesterId: string) {
  const access = await requireWorkspace("student");
  const { summary, demerits, merits, serviceCredits } = await loadLedger(access.profile.id);
  // Student-only: the faculty ledger response must not carry the available-merit list.
  const appliedMeritIds = new Set(merits.filter((m) => m.isApplied).map((m) => m.id));
  const availableMerits = getAvailableMeritsFifo(merits, appliedMeritIds, getTodayManila());
  const inSemester = <T extends { semester_id: string }>(rows: T[]) =>
    rows.filter((row) => row.semester_id === semesterId);
  return {
    summary: summary!,
    availableMerits,
    demerits: inSemester(demerits),
    merits: inSemester(merits),
    serviceCredits: inSemester(serviceCredits),
  };
}

const UUID_SCHEMA = z.string().uuid();

/**
 * Verifies that an application group belongs to the authenticated student and returns its summary details.
 * Validates the UUID first to prevent database 22P02 syntax errors, and returns null if not found.
 */
export async function getMyMeritApplicationGroup(
  applicationGroupId: string
): Promise<StudentMeritApplicationGroup | null> {
  const access = await requireWorkspace("student");
  const parsedId = UUID_SCHEMA.safeParse(applicationGroupId);
  if (!parsedId.success) return null;

  const client = await createUserClient();
  const { data, error } = await client
    .from("merit_applications")
    .select("application_group_id, bucket, applied_at")
    .eq("student_id", access.profile.id)
    .eq("application_group_id", parsedId.data);

  if (error || !data || data.length === 0) return null;

  return {
    application_group_id: parsedId.data,
    bucket: data[0].bucket,
    applied_days: data.length,
    applied_at: data[0].applied_at,
  };
}

/**
 * Council workspace query (FL-029).
 * Scoped to Council-generated demerits and Council-origin merit endorsements with the
 * merit units their approval created. Excludes whole-ledger balances, Faculty demerits,
 * merit applications and service sessions.
 */
export async function getCouncilDisciplinaryRecords(semesterId: string): Promise<CouncilDisciplinaryViewData> {
  await requireCouncilDisciplinaryViewer();
  const client = await createUserClient();

  const [demeritsRes, endorsementsRes, awardsRes] = await Promise.all([
    client
      .from("demerits")
      .select(DEMERIT_COLUMNS)
      .eq("source", "council")
      .eq("semester_id", semesterId)
      .order("incident_on", { ascending: false }),
    client
      .from("merit_endorsements")
      .select("id, student_id, semester_id, assigned_instructor_id, description, requested_days, status, submitted_by, submitted_at, decided_by, decided_at, decision_reason")
      .eq("semester_id", semesterId)
      .order("submitted_at", { ascending: false }),
    // Approval keeps the endorsement semester on its merits.
    client.from("merits").select("endorsement_id").eq("source", "endorsement").eq("semester_id", semesterId),
  ]);
  if (demeritsRes.error) throw new Error("Unable to load Council demerits");
  if (endorsementsRes.error) throw new Error("Unable to load merit endorsements");
  if (awardsRes.error) throw new Error("Unable to load endorsement merits");

  const names = await loadNames(client, [
    ...demeritsRes.data.map((d) => d.student_id),
    ...endorsementsRes.data.flatMap((e) => [e.student_id, e.assigned_instructor_id]),
  ]);
  const awardedDays = new Map<string, number>();
  for (const { endorsement_id } of awardsRes.data) {
    if (endorsement_id) awardedDays.set(endorsement_id, (awardedDays.get(endorsement_id) ?? 0) + 1);
  }

  return {
    demerits: demeritsRes.data.map((d) => ({
      ...toDemerit(d, names),
      student_university_id: names.get(d.student_id)?.university_id ?? null,
      student_name: nameOf(names, d.student_id),
    })),
    endorsements: endorsementsRes.data.map((e) => ({
      ...e,
      student_university_id: names.get(e.student_id)?.university_id ?? null,
      student_name: nameOf(names, e.student_id),
      assigned_instructor_name: nameOf(names, e.assigned_instructor_id),
      submitter_name: COUNCIL,
      awarded_days: awardedDays.get(e.id) ?? 0,
    })),
  };
}

/**
 * Faculty workspace query (FL-029), used from the student detail dialog.
 * Coordinators receive the complete ledger and balances; ordinary instructors only
 * the entries they issued. `access-policy` rejects a coordinator assignment without
 * its paired instructor role, matching `f_access_private.coordinator()`.
 */
export async function getStudentDisciplinaryLedger(studentId: string): Promise<FacultyDisciplinaryViewData> {
  const access = await requireWorkspace("faculty");
  const isCoordinator =
    access.roles.includes("Academic Coordinator") || access.roles.includes("RLE Coordinator");
  const ledger = await loadLedger(studentId, isCoordinator ? undefined : access.profile.id);
  return { isCoordinator, ...ledger };
}

/**
 * Faculty workspace query (FL-030).
 * Fetches direct merits issued by the authenticated instructor in the given semester,
 * filtered to source = 'direct' and grouped by award_request_key to aggregate multi-unit awards cleanly.
 */
export async function getMyFacultyMerits(semesterId: string): Promise<FacultyMeritGroup[]> {
  const access = await requireWorkspace("faculty");
  const actorId = access.profile.id;
  const client = await createUserClient();

  const { data, error } = await client
    .from("merits")
    .select(
      "id, student_id, semester_id, description, awarded_on, expires_on, created_at, award_request_key"
    )
    .eq("awarded_by", actorId)
    .eq("semester_id", semesterId)
    .eq("source", "direct")
    .order("awarded_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error("Unable to load faculty merit awards");
  if (!data || data.length === 0) return [];

  const names = await loadNames(client, data.map((m) => m.student_id));
  const groupsMap = new Map<string, FacultyMeritGroup>();

  for (const row of data) {
    const groupKey = row.award_request_key ?? row.id;
    const existing = groupsMap.get(groupKey);
    if (!existing) {
      groupsMap.set(groupKey, {
        id: groupKey,
        student_id: row.student_id,
        student_name: nameOf(names, row.student_id),
        student_university_id: names.get(row.student_id)?.university_id ?? null,
        semester_id: row.semester_id,
        description: row.description,
        awarded_on: row.awarded_on,
        expires_on: row.expires_on,
        days: 1,
        created_at: row.created_at,
      });
    } else {
      existing.days += 1;
    }
  }

  return Array.from(groupsMap.values());
}

/**
 * Active misconduct catalog options for Faculty demerit logging (FL-033).
 * Standard options appear alphabetically first, and the required 'Other' option appears last.
 */
export async function getActiveMisconductCatalog(): Promise<MisconductOption[]> {
  await requireWorkspace("faculty");
  const client = await createUserClient();

  const { data, error } = await client
    .from("misconduct_catalog")
    .select("id, label, is_other")
    .is("archived_at", null)
    .order("is_other", { ascending: true })
    .order("label", { ascending: true });

  if (error) throw new Error("Unable to load misconduct catalog");
  return data ?? [];
}

/**
 * Faculty workspace query (FL-033).
 * Fetches demerits issued by the authenticated instructor in the given semester,
 * strictly filtered to source = 'faculty' and issued_by = actor to keep future
 * external-CI records (T-047) isolated.
 * Grouped by incident_group_id with total units and waived units derived from waived_at.
 */
export async function getMyFacultyDemerits(semesterId: string): Promise<FacultyDemeritGroup[]> {
  const access = await requireWorkspace("faculty");
  const actorId = access.profile.id;
  const client = await createUserClient();

  const { data, error } = await client
    .from("demerits")
    .select(
      "id, incident_group_id, student_id, semester_id, bucket, description, incident_on, waived_at, created_at"
    )
    .eq("issued_by", actorId)
    .eq("semester_id", semesterId)
    .eq("source", "faculty")
    .order("incident_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error("Unable to load faculty demerit records");
  if (!data || data.length === 0) return [];

  const names = await loadNames(client, data.map((d) => d.student_id));
  const groupsMap = new Map<string, FacultyDemeritGroup>();

  for (const row of data) {
    const groupKey = row.incident_group_id;
    const existing = groupsMap.get(groupKey);
    const isWaived = Boolean(row.waived_at);

    if (!existing) {
      groupsMap.set(groupKey, {
        id: groupKey,
        student_id: row.student_id,
        student_name: nameOf(names, row.student_id),
        student_university_id: names.get(row.student_id)?.university_id ?? null,
        semester_id: row.semester_id,
        bucket: row.bucket,
        description: row.description,
        incident_on: row.incident_on,
        days: 1,
        waivedDays: isWaived ? 1 : 0,
        created_at: row.created_at,
      });
    } else {
      existing.days += 1;
      if (isWaived) {
        existing.waivedDays += 1;
      }
    }
  }

  return Array.from(groupsMap.values());
}

/**
 * Active Academic and Clinical Instructors available for Council merit endorsement assignment (FL-031).
 * Restricted to Council Executive and Operations.
 */
export async function getInstructorChoices(): Promise<InstructorChoice[]> {
  await requireCouncilDisciplinaryViewer();
  const client = await createUserClient();

  const { data, error } = await client.rpc("florence_instructor_choices");
  if (error) throw new Error("Unable to load instructor choices");

  // The RPC returns one row per instructor role; show each person once with all their roles.
  const byId = new Map<string, InstructorChoice>();
  for (const row of data ?? []) {
    const seen = byId.get(row.id);
    byId.set(row.id, seen ? { ...seen, instructor_role: `${seen.instructor_role} / ${row.instructor_role}` } : row);
  }
  return [...byId.values()];
}
