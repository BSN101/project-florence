import "server-only";

import { allRows } from "@/features/finance/queries";
import { displayName } from "@/lib/format-name";
import type { AccessContext } from "@/server/auth/access-context";
import { AccessDeniedError } from "@/server/auth/require-workspace";
import { createUserClient } from "@/server/db/user-client";

import {
  calculateDisciplinarySummary,
  demeritActors,
  evaluateMeritState,
  getTodayManila,
} from "./calculations";
import {
  formatDemeritIssuerLabel,
  formatDemeritWaivedByLabel,
  formatMeritAwarderLabel,
  formatReportTermLabel,
  resolveReportPeriod,
  summarizePeriodActivity,
} from "./report-calculations";
import type {
  DisciplinaryReportScope,
  StudentDisciplinaryReportData,
  StudentDisciplinaryReportDemeritRow,
  StudentDisciplinaryReportMeritRow,
  StudentDisciplinaryReportServiceCreditRow,
} from "./report-contracts";

type UserClient = Awaited<ReturnType<typeof createUserClient>>;

const DEMERIT_REPORT_COLUMNS =
  "id, incident_group_id, incident_unit_index, semester_id, bucket, source, description, incident_on, consequence_outcome, source_unit_index, issued_by, external_source_name, waived_at, waived_by, waiver_reason, created_at, misconduct:misconduct_catalog(label)";

const MERIT_REPORT_COLUMNS =
  "id, semester_id, source, description, awarded_on, expires_on, awarded_by, external_source_name, created_at";

const APPLICATION_REPORT_COLUMNS = "merit_id, bucket, applied_at";

const CREDIT_REPORT_COLUMNS =
  "id, semester_id, bucket, issued_by, issued_at, revoked_at, revocation_reason";

function extractMisconductLabel(
  misconduct: { label: string } | { label: string }[] | null
): string | null {
  if (!misconduct) return null;
  if (Array.isArray(misconduct)) return misconduct[0]?.label ?? null;
  return misconduct.label;
}

function normalizeDemeritSource(source: string): "faculty" | "council" | "external_ci" {
  if (source === "council") return "council";
  if (source === "external_ci") return "external_ci";
  return "faculty";
}

function normalizeMeritSource(source: string): "direct" | "endorsement" | "external_ci" {
  if (source === "endorsement") return "endorsement";
  if (source === "external_ci") return "external_ci";
  return "direct";
}

async function loadActorNames(
  client: UserClient,
  ids: readonly (string | null)[]
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(ids.filter((id): id is string => id !== null))];
  const names = new Map<string, string>();
  if (uniqueIds.length === 0) return names;

  const { data, error } = await client.rpc("florence_discipline_names", {
    p_ids: uniqueIds,
  });
  if (error) throw new Error("Unable to load disciplinary actor names");

  for (const row of data ?? []) {
    names.set(row.id, displayName(row));
  }
  return names;
}

/**
 * Loads the signed-in student's semester or academic-year disciplinary report (FL-045)
 * with cumulative all-time matching-bucket standing context.
 *
 * Returns `null` when the requested semester or academic year is not available to the student.
 */
export async function getStudentDisciplinaryReportForAccess(
  access: AccessContext,
  request: {
    scope: DisciplinaryReportScope;
    semesterId?: string | null;
    academicYearStart?: number | null;
  },
  snapshot: Date = new Date()
): Promise<StudentDisciplinaryReportData | null> {
  if (access.status !== "ready" || !access.workspaces.includes("student")) {
    throw new AccessDeniedError("forbidden");
  }

  const studentId = access.profile.id;
  const universityId = access.profile.university_id;
  if (!universityId) {
    throw new AccessDeniedError("forbidden");
  }

  const client = await createUserClient();

  const [demeritsData, meritsData, applicationsData, creditsData] = await Promise.all([
    allRows(
      (from, to) =>
        client
          .from("demerits")
          .select(DEMERIT_REPORT_COLUMNS)
          .eq("student_id", studentId)
          .order("incident_on", { ascending: false })
          .order("created_at", { ascending: false })
          .order("incident_group_id", { ascending: true })
          .order("incident_unit_index", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      "Unable to load student demerit records"
    ),
    allRows(
      (from, to) =>
        client
          .from("merits")
          .select(MERIT_REPORT_COLUMNS)
          .eq("student_id", studentId)
          .order("awarded_on", { ascending: false })
          .order("created_at", { ascending: false })
          .order("award_request_key", { ascending: true, nullsFirst: false })
          .order("award_unit_index", { ascending: true, nullsFirst: false })
          .order("endorsement_id", { ascending: true, nullsFirst: false })
          .order("endorsement_unit_index", { ascending: true, nullsFirst: false })
          .order("id", { ascending: true })
          .range(from, to),
      "Unable to load student merit records"
    ),
    allRows(
      (from, to) =>
        client
          .from("merit_applications")
          .select(APPLICATION_REPORT_COLUMNS)
          .eq("student_id", studentId)
          .order("applied_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to),
      "Unable to load student merit applications"
    ),
    allRows(
      (from, to) =>
        client
          .from("service_credits")
          .select(CREDIT_REPORT_COLUMNS)
          .eq("student_id", studentId)
          .order("issued_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to),
      "Unable to load student service credits"
    ),
  ]);

  const recordSemesterIds = new Set<string>();
  for (const row of demeritsData) recordSemesterIds.add(row.semester_id);
  for (const row of meritsData) recordSemesterIds.add(row.semester_id);
  for (const row of creditsData) recordSemesterIds.add(row.semester_id);

  const resolvedPeriod = resolveReportPeriod({
    scope: request.scope,
    requestedSemesterId: request.semesterId ?? null,
    requestedAcademicYearStart: request.academicYearStart ?? null,
    semesters: access.semesters,
    enrollments: access.enrollments,
    recordSemesterIds,
  });

  if (!resolvedPeriod) return null;

  const generatedAt = snapshot.toISOString();
  const asOfDateManila = getTodayManila(snapshot);

  const termLabelBySemesterId = new Map(
    access.semesters.map((s) => [s.id, formatReportTermLabel(s)])
  );

  const inPeriodDemerits = demeritsData.filter((d) =>
    resolvedPeriod.includedSemesterIds.has(d.semester_id)
  );
  const inPeriodMerits = meritsData.filter((m) =>
    resolvedPeriod.includedSemesterIds.has(m.semester_id)
  );
  const inPeriodCredits = creditsData.filter((c) =>
    resolvedPeriod.includedSemesterIds.has(c.semester_id)
  );

  // Same Council masking as the Conduct ledger: Council student actor UUIDs never reach florence_discipline_names.
  const actorIdsToResolve: (string | null)[] = inPeriodDemerits.flatMap(demeritActors);
  for (const m of inPeriodMerits) {
    if (m.source !== "external_ci" || !m.external_source_name?.trim()) {
      actorIdsToResolve.push(m.awarded_by);
    }
  }
  for (const c of inPeriodCredits) {
    actorIdsToResolve.push(c.issued_by);
  }

  const actorNames = await loadActorNames(client, actorIdsToResolve);

  const groupCounts = new Map<string, number>();
  for (const d of demeritsData) {
    groupCounts.set(d.incident_group_id, (groupCounts.get(d.incident_group_id) ?? 0) + 1);
  }

  const applicationByMeritId = new Map(
    applicationsData.map((app) => [app.merit_id, app])
  );
  const appliedMeritIds = new Set(applicationByMeritId.keys());

  const cumulativeSummary = calculateDisciplinarySummary({
    demerits: demeritsData,
    merits: meritsData,
    applications: applicationsData,
    serviceCredits: creditsData,
    asOfDate: asOfDateManila,
  });

  const demerits: StudentDisciplinaryReportDemeritRow[] = inPeriodDemerits.map((d) => {
    const source = normalizeDemeritSource(d.source);
    return {
      id: d.id,
      incident_on: d.incident_on,
      bucket: d.bucket,
      source,
      misconduct_label: extractMisconductLabel(d.misconduct),
      description: d.description,
      consequence_outcome: d.consequence_outcome,
      source_unit_index: d.source_unit_index,
      incident_unit_index: d.incident_unit_index,
      group_unit_count: groupCounts.get(d.incident_group_id) ?? 1,
      term_label: termLabelBySemesterId.get(d.semester_id) ?? resolvedPeriod.periodLabel,
      status: d.waived_at ? "waived" : "active",
      waived_at: d.waived_at,
      waiver_reason: d.waiver_reason,
      issuer_label: formatDemeritIssuerLabel({
        source,
        externalSourceName: d.external_source_name,
        issuerName: actorNames.get(d.issued_by) ?? null,
      }),
      waived_by_label: formatDemeritWaivedByLabel({
        source,
        waivedAt: d.waived_at,
        waivedByName: d.waived_by ? (actorNames.get(d.waived_by) ?? null) : null,
      }),
    };
  });

  const merits: StudentDisciplinaryReportMeritRow[] = inPeriodMerits.map((m) => {
    const source = normalizeMeritSource(m.source);
    const { isApplied, isExpired } = evaluateMeritState(m, appliedMeritIds, asOfDateManila);
    const application = isApplied ? applicationByMeritId.get(m.id) : undefined;
    return {
      id: m.id,
      awarded_on: m.awarded_on,
      expires_on: m.expires_on,
      source,
      description: m.description,
      term_label: termLabelBySemesterId.get(m.semester_id) ?? resolvedPeriod.periodLabel,
      status: isApplied ? "applied" : isExpired ? "expired" : "available",
      applied_bucket: application?.bucket ?? null,
      applied_at: application?.applied_at ?? null,
      awarder_label: formatMeritAwarderLabel({
        source,
        externalSourceName: m.external_source_name,
        awarderName: actorNames.get(m.awarded_by) ?? null,
      }),
    };
  });

  const serviceCredits: StudentDisciplinaryReportServiceCreditRow[] = inPeriodCredits.map((c) => ({
    id: c.id,
    issued_at: c.issued_at,
    bucket: c.bucket,
    term_label: termLabelBySemesterId.get(c.semester_id) ?? resolvedPeriod.periodLabel,
    status: c.revoked_at ? "revoked" : "active",
    revoked_at: c.revoked_at,
    revocation_reason: c.revocation_reason,
    supervisor_label: actorNames.get(c.issued_by) ?? "Instructor",
  }));

  const periodSummary = summarizePeriodActivity({
    demerits,
    merits,
    serviceCredits,
  });

  return {
    scope: resolvedPeriod.scope,
    periodLabel: resolvedPeriod.periodLabel,
    academicYearStart: resolvedPeriod.academicYearStart,
    generatedAt,
    asOfDateManila,
    student: {
      fullName: displayName(access.profile),
      universityId,
    },
    coveredTerms: resolvedPeriod.coveredTerms,
    availableAcademicYears: resolvedPeriod.availableAcademicYears,
    cumulativeSummary,
    periodSummary,
    demerits,
    merits,
    serviceCredits,
  };
}
