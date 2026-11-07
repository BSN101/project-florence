import type { Database } from "../../server/db/database.types";

export type Workspace = "student" | "council" | "faculty" | "admin";

type Tables = Database["public"]["Tables"];
export type AccessProfile = Pick<Tables["profiles"]["Row"],
  "id" | "account_status" | "university_id" | "first_name" | "middle_name" | "last_name" | "suffix">;
export type AccessRole = Pick<Tables["role_assignments"]["Row"], "role" | "profile_id" | "removed_at">;
export type AccessMembership = Pick<Tables["council_memberships"]["Row"],
  "access_role" | "profile_id" | "removed_at">;
export type AccessEnrollment = Pick<Tables["enrollments"]["Row"],
  "semester_id" | "student_id" | "year_level" | "academic_status">;
export type CurrentSemester = Pick<Tables["semesters"]["Row"],
  "id" | "academic_year_start" | "term" | "starts_on" | "ends_on">;

export type AccessGrants = {
  workspaces: Workspace[];
  roles: AccessRole["role"][];
  councilRole: AccessMembership["access_role"] | null;
};

/** Reject inconsistent combinations even if data constraints or RLS change. */
export function resolveAccess(
  profile: AccessProfile,
  roles: AccessRole[],
  memberships: AccessMembership[],
  enrollments: AccessEnrollment[],
): AccessGrants | null {
  if (profile.account_status !== "active" ||
    roles.some((r) => r.profile_id !== profile.id || r.removed_at !== null) ||
    memberships.some((m) => m.profile_id !== profile.id || m.removed_at !== null) ||
    enrollments.some((e) => e.student_id !== profile.id)) return null;

  const allowed = ["Academic Instructor", "Clinical Instructor", "Academic Coordinator", "RLE Coordinator", "Platform Admin"];
  const roleNames = roles.map((r) => r.role);
  if (roleNames.some((role) => !allowed.includes(role)) ||
    new Set(roleNames).size !== roleNames.length || memberships.length > 1) return null;

  const councilRole = memberships[0]?.access_role ?? null;
  if (councilRole && !["executive", "operations", "representative"].includes(councilRole)) return null;

  const student = enrollments.length > 0;
  const admin = roleNames.includes("Platform Admin");
  const academic = roleNames.includes("Academic Instructor");
  const clinical = roleNames.includes("Clinical Instructor");
  const academicCoordinator = roleNames.includes("Academic Coordinator");
  const rleCoordinator = roleNames.includes("RLE Coordinator");

  if (student) {
    if (!profile.university_id || roleNames.length > 0 ||
      new Set(enrollments.map((e) => e.semester_id)).size !== enrollments.length) return null;
    return {
      workspaces: councilRole ? ["student", "council"] : ["student"],
      roles: roleNames,
      councilRole,
    };
  }

  if (profile.university_id || councilRole || admin && roleNames.length !== 1 ||
    academic && clinical || academicCoordinator && !academic || rleCoordinator && !clinical ||
    academic && rleCoordinator || clinical && academicCoordinator ||
    !admin && !academic && !clinical) return null;

  return { workspaces: [admin ? "admin" : "faculty"], roles: roleNames, councilRole: null };
}
