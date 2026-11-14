import "server-only";

import { cache } from "react";
import { connection } from "next/server";
import { resolveAccess, type AccessEnrollment, type AccessGrants, type AccessProfile, type CurrentSemester, type SemesterOption } from "../../features/access/access-policy";
import { createUserClient } from "../db/user-client";

export type AccessContext =
  | { status: "unauthenticated" }
  | { status: "unavailable" }
  | { status: "error" }
  | ({ status: "ready"; email: string | null; profile: AccessProfile; enrollments: AccessEnrollment[];
      semesters: SemesterOption[]; currentSemester: CurrentSemester | null } & AccessGrants);

/**
 * Only a verified Auth user and the RLS-visible own profile can establish access.
 * Memoized per server request, so the page, shell and workspace layout share one lookup.
 */
export const getAccessContext = cache(async function getAccessContext(): Promise<AccessContext> {
  await connection();
  try {
    const client = await createUserClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError) return authError.name === "AuthSessionMissingError" ||
      authError.status === 401 || authError.status === 403
      ? { status: "unauthenticated" } : { status: "error" };
    if (!user || user.is_anonymous) return { status: "unauthenticated" };

    // Do not filter or select auth_user_id: the own_profile RLS policy is the link.
    const { data: profiles, error: profileError } = await client.from("profiles")
      .select("id,account_status,university_id,first_name,middle_name,last_name,suffix").limit(2);
    if (profileError) return { status: "error" };
    if (profiles?.length !== 1 || profiles[0].account_status !== "active") return { status: "unavailable" };
    const profile = profiles[0];

    const [roles, memberships, enrollments, semesters] = await Promise.all([
      client.from("role_assignments").select("role,profile_id,removed_at")
        .eq("profile_id", profile.id).is("removed_at", null),
      client.from("council_memberships").select("access_role,profile_id,removed_at")
        .eq("profile_id", profile.id).is("removed_at", null),
      client.from("enrollments").select("semester_id,student_id,year_level,academic_status")
        .eq("student_id", profile.id),
      client.from("semesters").select("id,academic_year_start,term,starts_on,ends_on,is_current")
        .order("starts_on", { ascending: false }),
    ]);
    if (roles.error || memberships.error || enrollments.error || semesters.error ||
      !roles.data || !memberships.data || !enrollments.data || !semesters.data ||
      semesters.data.filter((semester) => semester.is_current).length > 1) return { status: "error" };

    const grants = resolveAccess(profile, roles.data, memberships.data, enrollments.data);
    if (!grants) return { status: "unavailable" };
    return {
      status: "ready", email: user.email ?? null, profile, ...grants, enrollments: enrollments.data,
      semesters: semesters.data,
      currentSemester: semesters.data.find((semester) => semester.is_current) ?? null,
    };
  } catch {
    return { status: "error" };
  }
});
