import { cache } from "react";

import { AccessDeniedError, requireWorkspace } from "@/server/auth/require-workspace";
import { createUserClient } from "@/server/db/user-client";
import { fromCents, toCents } from "@/features/finance/calculations";
import { allRows, getCouncilFinancialRoster } from "@/features/finance/queries";
import { getRoster } from "@/features/students/queries";
import { displayName } from "@/lib/format-name";
import {
  isAuthorizedCouncilClearanceRole,
  isAuthorizedFacultyClearanceRole,
} from "./authorization";
import {
  buildCouncilClearanceCandidates,
  buildFacultyClearanceCandidates,
  buildStudentClearanceSummary,
  type StudentDisciplineMetrics,
} from "./candidates";
import {
  FACULTY_CLEARANCE_CONFIG,
  type CouncilClearanceCandidate,
  type FacultyClearanceCandidate,
  type FacultyClearanceComponent,
  type StudentClearanceSummary,
} from "./contracts";

export async function assertAuthorizedCouncilClearanceManager() {
  const context = await requireWorkspace("council");
  if (!isAuthorizedCouncilClearanceRole(context.councilRole)) {
    throw new AccessDeniedError("forbidden");
  }
  return context;
}

/**
 * Access guard for Faculty clearance management (FL-041).
 * Verifies authenticated Faculty workspace access and enforces role matching:
 * - Academic clearance requires Academic Coordinator role.
 * - RLE clearance requires RLE Coordinator role.
 */
export async function assertAuthorizedFacultyClearanceManager(component: FacultyClearanceComponent) {
  const context = await requireWorkspace("faculty");
  if (!isAuthorizedFacultyClearanceRole(context.roles, component)) {
    throw new AccessDeniedError("forbidden");
  }
  return context;
}

/**
 * Loads all candidates for Council clearance for the given semester (FL-040).
 * Authorized only for Council Executive and Council Operations.
 * Memoized per server request via React.cache.
 */
export const getCouncilClearanceCandidates = cache(async function getCouncilClearanceCandidates(
  semesterId: string
): Promise<CouncilClearanceCandidate[]> {
  const context = await assertAuthorizedCouncilClearanceManager();
  const client = await createUserClient();

  // Run financial roster, clearance records, and active demerits in parallel.
  // Uses deterministic ordering and paged reads to guarantee complete data past 1,000 rows.
  const [financialRoster, clearances, demerits] = await Promise.all([
    getCouncilFinancialRoster(semesterId),
    allRows(
      (from, to) =>
        client
          .from("clearances")
          .select("student_id, confirmed_at, confirmed_by")
          .eq("semester_id", semesterId)
          .eq("component", "council")
          .order("student_id")
          .range(from, to),
      "Unable to load council clearances"
    ),
    allRows(
      (from, to) =>
        client
          .from("demerits")
          .select("student_id")
          .eq("semester_id", semesterId)
          .eq("source", "council")
          .is("waived_at", null)
          .order("id")
          .range(from, to),
      "Unable to load active Council demerits"
    ),
  ]);

  const councilDemeritCounts = new Map<string, number>();
  for (const row of demerits) {
    councilDemeritCounts.set(row.student_id, (councilDemeritCounts.get(row.student_id) ?? 0) + 1);
  }

  const financialSummaries = new Map<string, { totalOutstandingPayable: number }>();
  for (const item of financialRoster) {
    financialSummaries.set(item.student_id, {
      // Pending proof is not settlement (FL-023), so it still counts as unpaid when reviewing clearance.
      totalOutstandingPayable: fromCents(
        toCents(item.summary.totalOutstandingPayable) + toCents(item.summary.totalPendingVerificationAmount)
      ),
    });
  }

  return buildCouncilClearanceCandidates({
    roster: financialRoster.map((student) => ({ ...student, name: displayName(student) })),
    clearances,
    financialSummaries,
    councilDemeritCounts,
    actorProfileId: context.profile.id,
  });
});

/**
 * Loads all candidates for Faculty clearance for the given semester and component (FL-041).
 * Gated to Academic Coordinator for 'academic' and RLE Coordinator for 'rle'.
 * Reads the semester's clearances and the component's bucket disciplinary records.
 * Memoized per server request via React.cache.
 */
export const getFacultyClearanceCandidates = cache(async function getFacultyClearanceCandidates(
  semesterId: string,
  component: FacultyClearanceComponent
): Promise<FacultyClearanceCandidate[]> {
  const context = await assertAuthorizedFacultyClearanceManager(component);
  const { bucket } = FACULTY_CLEARANCE_CONFIG[component];
  const client = await createUserClient();

  const roster = await getRoster(semesterId, "faculty");
  if (roster.length === 0) return [];

  const [semesterClearances, balances] = await Promise.all([
    allRows(
      (from, to) =>
        client
          .from("clearances")
          .select("student_id, component, confirmed_at, confirmed_by")
          .eq("semester_id", semesterId)
          .order("id")
          .range(from, to),
      "Unable to load semester clearances"
    ),
    // Cumulative bucket counts per enrolled student (all semesters, FL-029), computed in the database.
    allRows(
      (from, to) =>
        client
          .rpc("florence_bucket_balances", { p_semester: semesterId, p_bucket: bucket })
          .order("student_id")
          .range(from, to),
      "Unable to load disciplinary balances"
    ),
  ]);

  // Confirmer names via the restricted projection; own_profile RLS blocks a profiles read.
  const confirmerIds = [...new Set(semesterClearances.map((c) => c.confirmed_by))];
  const names = new Map<string, string>();
  if (confirmerIds.length > 0) {
    const { data, error } = await client.rpc("florence_clearance_names", { p_ids: confirmerIds });
    if (error) throw new Error("Unable to load names");
    for (const row of data) names.set(row.id, displayName(row));
  }

  const byComponent = (component: string) =>
    semesterClearances
      .filter((c) => c.component === component)
      .map((c) => ({ ...c, confirmed_by_name: names.get(c.confirmed_by) ?? null }));

  const disciplineMap = new Map<string, StudentDisciplineMetrics>(
    balances.map((b) => [b.student_id, {
      activeDemerits: b.active_demerits,
      appliedMerits: b.applied_merits,
      serviceCredits: b.active_service_credits,
      netBalance: b.active_demerits - b.applied_merits - b.active_service_credits,
    }])
  );

  return buildFacultyClearanceCandidates({
    roster: roster.map((student) => ({ ...student, name: displayName(student) })),
    councilClearances: byComponent("council"),
    academicClearances: byComponent("academic"),
    rleClearances: byComponent("rle"),
    disciplineMap,
    actorProfileId: context.profile.id,
    component,
    bucket,
  });
});

/**
 * Loads the authenticated student's clearance summary for an enrolled semester (FL-042).
 * Memoized per server request via React.cache.
 */
export const getStudentClearanceSummary = cache(async function getStudentClearanceSummary(
  semesterId: string
): Promise<StudentClearanceSummary> {
  const context = await requireWorkspace("student");
  const semester = context.semesters.find(
    (s) => s.id === semesterId && context.enrollments.some((e) => e.semester_id === s.id)
  );
  if (!semester) {
    throw new AccessDeniedError("forbidden");
  }

  const client = await createUserClient();
  const { data: rawClearances, error } = await client
    .from("clearances")
    .select("component, confirmed_at, confirmed_by")
    .eq("student_id", context.profile.id)
    .eq("semester_id", semester.id);

  if (error) {
    throw new Error("Unable to load clearance records");
  }

  const confirmerIds = [...new Set(rawClearances.map((c) => c.confirmed_by))];
  const names = new Map<string, string>();
  if (confirmerIds.length > 0) {
    const { data: nameData, error: nameError } = await client.rpc("florence_clearance_names", {
      p_ids: confirmerIds,
    });
    // FL-042 requires the confirmer to be shown; fail loudly rather than hide it.
    if (nameError) {
      throw new Error("Unable to load clearance confirmer names");
    }
    for (const row of nameData ?? []) {
      names.set(row.id, displayName(row));
    }
  }

  return buildStudentClearanceSummary({
    semesterName: `${semester.academic_year_start}–${semester.academic_year_start + 1} ${semester.term}`,
    clearances: rawClearances.map((c) => ({
      ...c,
      confirmed_by_name: names.get(c.confirmed_by) ?? null,
    })),
  });
});
