import type { Database } from "@/server/db/database.types";

export type CouncilAccessRole = Database["public"]["Enums"]["council_access_role"];

export type CanConfirmClearanceResult =
  | { allowed: true }
  | { allowed: false; reason: "unauthorized_role" | "self_clearance_prohibited" };

/**
 * Authorized roles for Council clearance management (FL-040).
 * Only Executive and Operations officers have discretion to confirm clearances.
 */
export function isAuthorizedCouncilClearanceRole(role?: string | null): boolean {
  return role === "executive" || role === "operations";
}

/**
 * Checks whether an actor is authorized to confirm Council clearance for a student (FL-040).
 * - Council Executive and Operations are permitted.
 * - Council Representatives, Students, Faculty, and unassigned callers are denied.
 * - Strict Anti-Self-Clearance: Officers who are also enrolled students cannot clear themselves.
 */
export function canConfirmCouncilClearance({
  actorProfileId,
  studentId,
  councilRole,
}: {
  actorProfileId: string;
  studentId: string;
  councilRole?: string | null;
}): CanConfirmClearanceResult {
  if (!isAuthorizedCouncilClearanceRole(councilRole)) {
    return { allowed: false, reason: "unauthorized_role" };
  }

  if (actorProfileId === studentId) {
    return { allowed: false, reason: "self_clearance_prohibited" };
  }

  return { allowed: true };
}
