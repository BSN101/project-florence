import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

import { runCommand } from "@/features/access/provisioning-service";
import { AccessDeniedError, requireWorkspace } from "@/server/auth/require-workspace";
import { createCommandClient } from "@/server/db/command-client";

import type {
  RosterImportPreview,
  RosterImportPreviewResult,
  RosterImportResult,
  StudentActionResult,
} from "./contracts";
import { mergeRosterImportFindings, parseRosterCsv } from "./csv";
import {
  applyRosterImportSchema,
  createStudentSchema,
  previewRosterImportSchema,
  updateStudentSchema,
} from "./schemas";

/** The Council workspace alone is not authority; only Executive and Operations manage the roster. */
export async function requireRosterManager() {
  const context = await requireWorkspace("council");
  if (context.councilRole !== "executive" && context.councilRole !== "operations") throw new AccessDeniedError("forbidden");
  return context;
}

/**
 * Directory view access: Council Executive and Operations under /council,
 * or Instructors under /faculty (coordinators hold an instructor role too).
 * Council Representatives and Students are denied directory access.
 * Mirrors f_access_private.council() / faculty(), which florence_roster re-checks.
 */
export async function requireDirectoryViewer(workspace: "council" | "faculty") {
  const context = await requireWorkspace(workspace);
  if (workspace === "council") {
    if (context.councilRole !== "executive" && context.councilRole !== "operations") {
      throw new AccessDeniedError("forbidden");
    }
  } else if (workspace === "faculty") {
    const isInstructor =
      context.roles.includes("Academic Instructor") || context.roles.includes("Clinical Instructor");
    if (!isInstructor) throw new AccessDeniedError("forbidden");
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

export async function previewRosterImport(raw: unknown): Promise<RosterImportPreviewResult> {
  const actor = await requireRosterManager();
  const parsed = previewRosterImportSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid preview payload" };
  }
  const csvResult = parseRosterCsv(parsed.data.csvText);
  if ("error" in csvResult) {
    return { success: false, error: csvResult.error };
  }

  const client = createCommandClient();
  const { data, error } = await (client.rpc as unknown as (f: string, a: Record<string, unknown>) =>
    Promise<{ data: unknown; error: PostgrestError | null }>)("roster_import_csv", {
    p_key: crypto.randomUUID(),
    p_actor: actor.profile.id,
    p_rows: csvResult.rows,
    p_apply: false,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const preview = data as RosterImportPreview;
  const merged = mergeRosterImportFindings(preview, csvResult.invalid);
  return { success: true, preview: merged };
}

export async function applyRosterImport(raw: unknown): Promise<RosterImportResult> {
  const actor = await requireRosterManager();
  const parsed = applyRosterImportSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid import payload" };
  }
  const csvResult = parseRosterCsv(parsed.data.csvText);
  if ("error" in csvResult) {
    return { success: false, error: csvResult.error };
  }
  if (csvResult.invalid.length > 0) {
    return {
      success: false,
      error: `Import has ${csvResult.invalid.length} invalid row(s); preview the file and resolve them`,
    };
  }

  const { result, failure } = await runCommand(
    "roster_import_csv",
    {
      p_key: parsed.data.requestKey,
      p_actor: actor.profile.id,
      p_rows: csvResult.rows,
      p_apply: true,
    },
    "/council",
  );

  if (failure) {
    return { success: false, error: !failure.success ? failure.error : "Failed to import roster." };
  }

  const res = result as {
    total?: number;
    created?: number;
    re_enrolled?: number;
    updated?: number;
    replayed?: boolean;
  };

  const total = Number(res?.total ?? 0);
  const created = Number(res?.created ?? 0);
  const re_enrolled = Number(res?.re_enrolled ?? 0);
  const updated = Number(res?.updated ?? 0);

  return {
    success: true,
    message: res?.replayed
      ? `Roster import was already applied (${total} student${total === 1 ? "" : "s"}).`
      : `Successfully imported ${total} student${total === 1 ? "" : "s"} (${created} new, ${re_enrolled} re-enrolled, ${updated} updated).`,
    summary: { total, created, re_enrolled, updated },
  };
}
