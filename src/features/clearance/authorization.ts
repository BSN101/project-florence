import type { Database } from "@/server/db/database.types";
import type { FacultyClearanceComponent } from "./contracts";

export type CouncilAccessRole = Database["public"]["Enums"]["council_access_role"];

export type CanConfirmClearanceResult =
  | { allowed: true }
  | { allowed: false; reason: "unauthorized_role" | "self_clearance_prohibited" };

export type CanConfirmFacultyClearanceResult =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | "unauthorized_role"
        | "self_clearance_prohibited"
        | "council_clearance_required"
        | "historical_semester_readonly";
    };

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
 * Checks whether an actor is authorized to confirm Faculty clearance for a student (FL-041).
 * - Role-scoped: Academic Coordinator for 'academic', RLE Coordinator for 'rle'.
 * - Council Clearance Prerequisite: Council clearance must already be confirmed for the same student & semester.
 * - Strict Anti-Self-Clearance: Coordinators cannot confirm clearance for their own student record.
 * - Historical Semester Guard: Confirmation permitted only on the active current semester.
 */
export function canConfirmFacultyClearance({
  actorProfileId,
  studentId,
  roles,
  component,
  councilCleared,
  isCurrentSemester,
}: {
  actorProfileId: string;
  studentId: string;
  roles?: readonly string[] | null;
  component: FacultyClearanceComponent;
  councilCleared: boolean;
  isCurrentSemester?: boolean;
}): CanConfirmFacultyClearanceResult {
  if (isCurrentSemester !== undefined && !isCurrentSemester) {
    return { allowed: false, reason: "historical_semester_readonly" };
  }

  if (!isAuthorizedFacultyClearanceRole(roles, component)) {
    return { allowed: false, reason: "unauthorized_role" };
  }

  if (actorProfileId === studentId) {
    return { allowed: false, reason: "self_clearance_prohibited" };
  }

  if (!councilCleared) {
    return { allowed: false, reason: "council_clearance_required" };
  }

  return { allowed: true };
}

