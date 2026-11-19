import { cache } from "react";

import { AccessDeniedError, requireWorkspace } from "@/server/auth/require-workspace";
import { createUserClient } from "@/server/db/user-client";
import { fromCents, toCents } from "@/features/finance/calculations";
import { allRows, getCouncilFinancialRoster } from "@/features/finance/queries";
import { displayName } from "@/lib/format-name";
import { isAuthorizedCouncilClearanceRole } from "./authorization";
import { buildCouncilClearanceCandidates } from "./candidates";
import type { CouncilClearanceCandidate } from "./contracts";

export async function assertAuthorizedCouncilClearanceManager() {
  const context = await requireWorkspace("council");
  if (!isAuthorizedCouncilClearanceRole(context.councilRole)) {
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
