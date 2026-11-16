import { cache } from "react";

import { AccessDeniedError, requireWorkspace } from "@/server/auth/require-workspace";
import { createUserClient } from "@/server/db/user-client";
import { getCouncilFinancialRoster } from "@/features/finance/queries";
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

/** Reads all rows past the PostgREST API 1,000-row cap with early exit on single page. */
async function allRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  errorMessage: string
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; ) {
    const { data, error } = await fetchPage(from, from + 999);
    if (error) throw new Error(`${errorMessage}: ${error.message}`);
    if (!data?.length) return rows;
    rows.push(...data);
    if (data.length < 1000) return rows;
    from += data.length;
  }
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
      totalOutstandingPayable: item.summary.totalOutstandingPayable,
    });
  }

  return buildCouncilClearanceCandidates({
    roster: financialRoster,
    clearances,
    financialSummaries,
    councilDemeritCounts,
    actorProfileId: context.profile.id,
  });
});
