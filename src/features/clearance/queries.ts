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
  type StudentDisciplineMetrics,
} from "./candidates";
import type {
  CouncilClearanceCandidate,
  FacultyClearanceCandidate,
  FacultyClearanceComponent,
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
 * Reads Council clearance confirmations (prerequisite) and specific bucket disciplinary records.
 * Memoized per server request via React.cache.
 */
export const getFacultyClearanceCandidates = cache(async function getFacultyClearanceCandidates(
  semesterId: string,
  component: FacultyClearanceComponent,
  bucket: "office" | "rle"
): Promise<FacultyClearanceCandidate[]> {
  const context = await assertAuthorizedFacultyClearanceManager(component);
  const client = await createUserClient();

  const roster = await getRoster(semesterId, "faculty");
  if (roster.length === 0) return [];

  const candidateIds = roster.map((student) => student.student_id);

  // Run all clearances for the semester, and bucket disciplinary records strictly scoped to candidateIds in parallel.
  const [semesterClearances, demerits, applications, serviceCredits] =
    await Promise.all([
      allRows(
        (from, to) =>
          client
            .from("clearances")
            .select("student_id, component, confirmed_at, confirmed_by")
            .eq("semester_id", semesterId)
            .order("student_id")
            .range(from, to),
        "Unable to load semester clearances"
      ),
      allRows(
        (from, to) =>
          client
            .from("demerits")
            .select("student_id, bucket, waived_at")
            .eq("bucket", bucket)
            .is("waived_at", null)
            .in("student_id", candidateIds)
            .order("id")
            .range(from, to),
        "Unable to load active demerits"
      ),
      allRows(
        (from, to) =>
          client
            .from("merit_applications")
            .select("student_id, bucket")
            .eq("bucket", bucket)
            .in("student_id", candidateIds)
            .order("id")
            .range(from, to),
        "Unable to load merit applications"
      ),
      allRows(
        (from, to) =>
          client
            .from("service_credits")
            .select("student_id, bucket, revoked_at")
            .eq("bucket", bucket)
            .is("revoked_at", null)
            .in("student_id", candidateIds)
            .order("id")
            .range(from, to),
        "Unable to load active service credits"
      ),
    ]);

  // Resolve confirming officer profile UUIDs to formatted names (FL-042)
  const confirmerIds = Array.from(
    new Set(semesterClearances.map((c) => c.confirmed_by).filter(Boolean))
  );

  const confirmerMap = new Map<string, string>();
  if (confirmerIds.length > 0) {
    const { data: profiles } = await client
      .from("profiles")
      .select("id, first_name, middle_name, last_name, suffix")
      .in("id", confirmerIds);

    for (const p of profiles ?? []) {
      confirmerMap.set(p.id, displayName(p));
    }
  }

  // Partition clearances by component with resolved actor names
  const councilClearances = [];
  const academicClearances = [];
  const rleClearances = [];

  for (const c of semesterClearances) {
    const entry = {
      student_id: c.student_id,
      confirmed_at: c.confirmed_at,
      confirmed_by: c.confirmed_by,
      confirmed_by_name: confirmerMap.get(c.confirmed_by) ?? null,
    };
    if (c.component === "council") councilClearances.push(entry);
    else if (c.component === "academic") academicClearances.push(entry);
    else if (c.component === "rle") rleClearances.push(entry);
  }

  // Aggregate bucket discipline counts per student (cumulative across all semesters, FL-029 / T-041)
  const disciplineMap = new Map<string, StudentDisciplineMetrics>();
  const getMetrics = (studentId: string): StudentDisciplineMetrics => {
    let m = disciplineMap.get(studentId);
    if (!m) {
      m = { activeDemerits: 0, appliedMerits: 0, serviceCredits: 0, netBalance: 0 };
      disciplineMap.set(studentId, m);
    }
    return m;
  };

  for (const d of demerits) {
    getMetrics(d.student_id).activeDemerits++;
  }
  for (const a of applications) {
    getMetrics(a.student_id).appliedMerits++;
  }
  for (const c of serviceCredits) {
    getMetrics(c.student_id).serviceCredits++;
  }

  for (const m of disciplineMap.values()) {
    m.netBalance = m.activeDemerits - m.appliedMerits - m.serviceCredits;
  }

  return buildFacultyClearanceCandidates({
    roster: roster.map((student) => ({ ...student, name: displayName(student) })),
    councilClearances,
    academicClearances,
    rleClearances,
    disciplineMap,
    actorProfileId: context.profile.id,
    component,
    bucket,
  });
});

