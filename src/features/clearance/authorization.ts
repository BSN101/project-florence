import type { Database } from "@/server/db/database.types";
import type { FacultyClearanceComponent } from "./contracts";

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
 * Authorized roles for Faculty clearance management (FL-041).
 * Academic clearance requires Academic Coordinator role;
 * RLE clearance requires RLE Coordinator role.
 */
export function isAuthorizedFacultyClearanceRole(
  roles: readonly string[] | string[] | null | undefined,
  component: FacultyClearanceComponent
): boolean {
  if (!roles) return false;
  const requiredRole = component === "academic" ? "Academic Coordinator" : "RLE Coordinator";
  return roles.includes(requiredRole);
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

/**
 * Checks whether an actor may confirm Faculty clearance for a student (FL-041).
 * - Academic Coordinator for 'academic', RLE Coordinator for 'rle'.
 * - No self-clearance.
 * Any semester the student is enrolled in is allowed, like Council clearance. The Council
 * prerequisite and enrollment are enforced by `confirm_clearance` under its lock.
 */
export function canConfirmFacultyClearance({
  actorProfileId,
  studentId,
  roles,
  component,
}: {
  actorProfileId: string;
  studentId: string;
  roles?: readonly string[] | null;
  component: FacultyClearanceComponent;
}): CanConfirmClearanceResult {
  if (!isAuthorizedFacultyClearanceRole(roles, component)) {
    return { allowed: false, reason: "unauthorized_role" };
  }

  if (actorProfileId === studentId) {
    return { allowed: false, reason: "self_clearance_prohibited" };
  }

  return { allowed: true };
}
