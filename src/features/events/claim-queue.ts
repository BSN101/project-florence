import type { ClaimQueueRow } from "./contracts";

export type ClaimSide = "time_in" | "time_out";
export type ClaimDecision = "verify" | "reject";

/** One student's waiting selfie claims, reviewed time-in first (FL-050). */
export type StudentClaims = {
  student_id: string;
  time_in?: ClaimQueueRow;
  time_out?: ClaimQueueRow;
  /** Earliest waiting submission, so the student who has waited longest is first. */
  oldest: string;
};

/**
 * Groups pending claims by student, leaving out claims already decided on this page.
 * Rejecting a time-in also rejects that student's pending time-out (the RPC does it), so it leaves too.
 */
export function groupClaims(claims: ClaimQueueRow[], decided: ReadonlyMap<string, ClaimDecision>): StudentClaims[] {
  const groups = new Map<string, StudentClaims>();
  for (const claim of claims) {
    if (decided.has(claim.id)) continue;
    const group = groups.get(claim.student_id) ?? { student_id: claim.student_id, oldest: claim.submitted_at };
    group[claim.kind as ClaimSide] = claim;
    if (claim.submitted_at < group.oldest) group.oldest = claim.submitted_at;
    groups.set(claim.student_id, group);
  }
  const rejectedIn = new Set(claims.filter((c) => c.kind === "time_in" && decided.get(c.id) === "reject").map((c) => c.student_id));
  for (const id of rejectedIn) {
    const group = groups.get(id);
    if (!group?.time_out) continue;
    delete group.time_out;
    if (!group.time_in) groups.delete(id);
  }
  return [...groups.values()].sort((a, b) => a.oldest.localeCompare(b.oldest));
}

/** The claim to review next for a student: time-in before time-out. */
export const nextClaim = (group: StudentClaims) => group.time_in ?? group.time_out ?? null;

/** A time-out can be verified only once a time-in is recorded, before or during this review. */
export function canVerify(claim: ClaimQueueRow, timeInRecorded: boolean) {
  return claim.kind === "time_in" || timeInRecorded;
}
