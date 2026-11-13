import "server-only";

import { revalidatePath } from "next/cache";

import { createInvitationToken } from "@/features/access/invitation-token";
import { commandError, deliverInvitation, runCommand, sendAndRecordInvitation } from "@/features/access/provisioning-service";
import { trustedRequestOrigin } from "@/features/auth/request-origin";
import { AccessDeniedError, requireWorkspace } from "@/server/auth/require-workspace";
import { createCommandClient } from "@/server/db/command-client";
import type { Json } from "@/server/db/database.types";
import { createUserClient } from "@/server/db/user-client";

import {
  BULK_INVITE_BATCH_SIZE,
  isAuthorizedDirectoryViewer,
  isAuthorizedRosterManager,
  isStudentEligibleForInvite,
  type BulkInviteOutcome,
  type BulkInviteResult,
  type RosterImportPreview,
  type RosterImportPreviewResult,
  type RosterImportResult,
  type StudentActionResult,
} from "./contracts";
import { mergeRosterImportFindings, parseRosterCsv } from "./csv";
import {
  applyRosterImportSchema,
  bulkInviteSchema,
  cancelInvitationSchema,
  createStudentSchema,
  inviteStudentSchema,
  previewRosterImportSchema,
  updateStudentSchema,
} from "./schemas";

/** The Council workspace alone is not authority; only Executive and Operations manage the roster. */
export async function requireRosterManager() {
  const context = await requireWorkspace("council");
  if (!isAuthorizedRosterManager(context.councilRole)) throw new AccessDeniedError("forbidden");
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
  if (!isAuthorizedDirectoryViewer(workspace, context.councilRole, context.roles)) {
    throw new AccessDeniedError("forbidden");
  }
  return context;
}

const invalid = (error: { issues: { message: string }[] }): { success: false; error: string } =>
  ({ success: false, error: error.issues[0]?.message ?? "Check the form and try again." });

// Commands run in one transaction inside the RPC; the actor comes from the verified session.

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
  const { data, error } = await client.rpc("roster_import_csv", {
    p_key: crypto.randomUUID(),
    p_actor: actor.profile.id,
    p_rows: csvResult.rows as unknown as Json,
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

/**
 * Sends or reissues an invitation to a roster student.
 * FL-008: Roster creation and email delivery have separate outcomes.
 * A delivery failure never undoes the invitation or roster record.
 */
export async function inviteStudent(raw: unknown): Promise<StudentActionResult> {
  const actor = await requireRosterManager();
  const parsed = inviteStudentSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const { studentId, requestKey } = parsed.data;

  const invitation = createInvitationToken();
  const { result, failure } = await runCommand("roster_invite_student", {
    p_key: requestKey ?? crypto.randomUUID(),
    p_actor: actor.profile.id,
    p_student: studentId,
    p_token_hash: invitation.tokenHash,
    p_expires_at: invitation.expiresAt,
  }, "/council");

  if (failure) return failure;

  // Recipient comes from the database result, never from the browser.
  const done = result!.previous_closed ? "New invitation created; the previous link no longer works." : "Invitation created.";
  return deliverInvitation(result!, invitation, result!.email as string, result!.first_name as string, done);
}

/**
 * Cancels a pending student invitation within Council scope.
 */
export async function cancelStudentInvitation(raw: unknown): Promise<StudentActionResult> {
  const actor = await requireRosterManager();
  const parsed = cancelInvitationSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const { invitationId, requestKey } = parsed.data;

  const { failure } = await runCommand("roster_cancel_invitation", {
    p_key: requestKey ?? crypto.randomUUID(),
    p_actor: actor.profile.id,
    p_invitation: invitationId,
  }, "/council");

  if (failure) return failure;
  return { success: true, message: "Invitation cancelled." };
}

/**
 * Bulk invites all eligible uninvited students enrolled in the specified semester.
 * Eligible: active account status, no Auth account, valid email, and no pending invitation.
 */
export async function bulkInviteStudents(raw: unknown): Promise<BulkInviteResult> {
  const actor = await requireRosterManager();
  const parsed = bulkInviteSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const { semesterId, excludeIds } = parsed.data;

  const client = await createUserClient();
  const { data: roster, error } = await client.rpc("florence_roster", { p_semester: semesterId });
  if (error || !roster) {
    return { success: false, error: "Unable to load the roster for invitation processing." };
  }

  const excluded = new Set(excludeIds);
  const eligible = roster.filter((s) => isStudentEligibleForInvite(s) && !excluded.has(s.student_id));

  const commandClient = createCommandClient();
  const origin = await trustedRequestOrigin();
  const outcomes: BulkInviteOutcome[] = [];

  // shortcut: one bounded batch per request keeps it under the server time limit; the dialog
  // calls again until remaining is 0. Move to a background queue if rosters reach thousands.
  const batch = eligible.slice(0, BULK_INVITE_BATCH_SIZE);

  for (const student of batch) {
    const outcome = (status: BulkInviteOutcome["status"], reason?: string) =>
      outcomes.push({ studentId: student.student_id, name: `${student.last_name}, ${student.first_name}`, status, reason });
    const invitation = createInvitationToken();
    const { data: result, error: rpcError } = await commandClient.rpc("roster_invite_student", {
      p_key: crypto.randomUUID(),
      p_actor: actor.profile.id,
      p_student: student.student_id,
      p_token_hash: invitation.tokenHash,
      p_expires_at: invitation.expiresAt,
      // Another run already sent this student a live link; don't break it.
      p_skip_pending: true,
    });

    if (rpcError || !result) {
      outcome("failed", rpcError ? (commandError(rpcError) as { error: string }).error : undefined);
      continue;
    }
    const created = result as { skipped?: boolean; invitation_id?: string; email?: string };
    if (created.skipped) {
      outcome("skipped", "Another officer already sent this student a link.");
      continue;
    }

    // Recipient comes from the database result, never from the browser.
    const sent = await sendAndRecordInvitation(created.invitation_id, origin && created.email
      ? { origin, to: created.email, firstName: student.first_name, token: invitation.token, expiresAt: invitation.expiresAt }
      : null);
    if (sent) outcome("sent");
    else outcome("email_failed", "Invitation created, but the email couldn't be sent.");
  }

  if (batch.length > 0) revalidatePath("/council", "layout");
  return { success: true, outcomes, remaining: eligible.length - batch.length };
}
