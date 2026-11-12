import "server-only";

import { runCommand } from "@/features/access/provisioning-service";
import { AccessDeniedError, requireWorkspace } from "@/server/auth/require-workspace";

import type { StudentActionResult } from "./contracts";
import { createStudentSchema, updateStudentSchema } from "./schemas";

/** The Council workspace alone is not authority; only Executive and Operations manage the roster. */
export async function requireRosterManager() {
  const context = await requireWorkspace("council");
  if (context.councilRole !== "executive" && context.councilRole !== "operations") throw new AccessDeniedError("forbidden");
  return context;
}

/**
 * Directory view access: Council Executive and Operations under /council,
 * or Instructors and Coordinators under /faculty.
 * Council Representatives and Students are denied directory access.
 */
export async function requireDirectoryViewer(workspace: "council" | "faculty") {
  const context = await requireWorkspace(workspace);
  if (workspace === "council") {
    if (context.councilRole !== "executive" && context.councilRole !== "operations") {
      throw new AccessDeniedError("forbidden");
    }
  } else if (workspace === "faculty") {
    const isFaculty =
      context.roles.includes("Academic Instructor") ||
      context.roles.includes("Clinical Instructor") ||
      context.roles.includes("Academic Coordinator") ||
      context.roles.includes("RLE Coordinator");
    if (!isFaculty) throw new AccessDeniedError("forbidden");
  }
  return context;
}

const invalid = (error: { issues: { message: string }[] }): StudentActionResult =>
  ({ success: false, error: error.issues[0]?.message ?? "Check the form and try again." });

// Both commands run in one transaction inside the RPC, which also resolves the
// current semester; the actor comes from the verified session, never the browser.

export async function addStudentToRoster(raw: unknown): Promise<StudentActionResult> {
  const actor = await requireRosterManager();
  const parsed = createStudentSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const s = parsed.data;
  const { result, failure } = await runCommand("roster_add_student", {
    p_key: crypto.randomUUID(), p_actor: actor.profile.id, p_university_id: s.university_id,
    p_last_name: s.last_name, p_first_name: s.first_name, p_middle_name: s.middle_name, p_suffix: s.suffix,
    p_email: s.email, p_year_level: s.year_level, p_academic_status: s.academic_status,
  }, "/council");
  if (failure) return failure;
  return { success: true, message: result?.profile_created
    ? `Added ${s.university_id} to the roster.`
    : `Re-enrolled ${s.university_id} using their existing student profile.` };
}

export async function updateStudentRosterEntry(raw: unknown): Promise<StudentActionResult> {
  const actor = await requireRosterManager();
  const parsed = updateStudentSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const s = parsed.data;
  const { failure } = await runCommand("roster_update_student", {
    p_key: crypto.randomUUID(), p_actor: actor.profile.id, p_student: s.student_id,
    p_last_name: s.last_name, p_first_name: s.first_name, p_middle_name: s.middle_name, p_suffix: s.suffix,
    p_email: s.email, p_year_level: s.year_level, p_academic_status: s.academic_status,
  }, "/council");
  return failure ?? { success: true, message: "Student details updated." };
}
