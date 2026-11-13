import "server-only";

import { revalidatePath } from "next/cache";

import { createInvitationToken } from "@/features/access/invitation-token";
import { runCommand } from "@/features/access/provisioning-service";
import { trustedRequestOrigin } from "@/features/auth/request-origin";
import { AccessDeniedError, requireWorkspace } from "@/server/auth/require-workspace";
import { createCommandClient } from "@/server/db/command-client";
import { createUserClient } from "@/server/db/user-client";
import { sendInvitationEmail } from "@/server/email/invitation-email";

import {
  isAuthorizedDirectoryViewer,
  isAuthorizedRosterManager,
  isStudentEligibleForInvite,
  type BulkInviteResult,
  type StudentActionResult,
} from "./contracts";
import {
  bulkInviteSchema,
  cancelInvitationSchema,
  createStudentSchema,
  inviteStudentSchema,
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

const invalid = (error: { issues: { message: string }[] }): StudentActionResult =>
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

  const to = result?.email as string | undefined;
  const firstName = (result?.first_name as string | undefined) ?? "Student";
  const wasClosed = Boolean(result?.previous_closed);
  const done = wasClosed ? "New invitation created; the previous link no longer works." : "Invitation created.";

  if (result?.replayed) {
    return { success: true, message: `${done} This was a repeated request, so no email was sent.` };
  }

  if (!to) {
    return { success: true, message: done };
  }

  const origin = await trustedRequestOrigin();
  if (!origin) {
    return { success: true, message: `${done} The invitation email couldn't be sent. Try again later.` };
  }

  try {
    await sendInvitationEmail({ origin, to, firstName, token: invitation.token, expiresAt: invitation.expiresAt });
    return { success: true, message: `${done} An invitation email was sent to ${to}.` };
  } catch {
    return { success: true, message: `${done} The invitation email couldn't be sent. Use Reissue invitation to try again.` };
  }
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
  const { semesterId } = parsed.data;

  const client = await createUserClient();
  const { data: roster, error } = await client.rpc("florence_roster", { p_semester: semesterId });
  if (error || !roster) {
    return { success: false, error: "Unable to load the roster for invitation processing." };
  }

  const eligible = roster.filter(isStudentEligibleForInvite);
  if (eligible.length === 0) {
    return {
      success: true,
      totalEligible: 0,
      invitedCount: 0,
      failedCount: 0,
      emailFailedCount: 0,
      message: "No uninvited students with valid emails were found.",
    };
  }

  const commandClient = createCommandClient();
  const origin = await trustedRequestOrigin();
  let invitedCount = 0;
  let failedCount = 0;
  let emailFailedCount = 0;

  for (const student of eligible) {
    const invitation = createInvitationToken();
    const { data: result, error: rpcError } = await commandClient.rpc("roster_invite_student", {
      p_key: crypto.randomUUID(),
      p_actor: actor.profile.id,
      p_student: student.student_id,
      p_token_hash: invitation.tokenHash,
      p_expires_at: invitation.expiresAt,
    });

    if (rpcError || !result) {
      failedCount++;
      continue;
    }

    invitedCount++;

    if (origin && student.email) {
      try {
        await sendInvitationEmail({
          origin,
          to: student.email,
          firstName: student.first_name,
          token: invitation.token,
          expiresAt: invitation.expiresAt,
        });
      } catch {
        emailFailedCount++;
      }
    } else {
      emailFailedCount++;
    }
  }

  revalidatePath("/council", "layout");

  const message =
    emailFailedCount > 0
      ? `Sent ${invitedCount} invitation(s). (${emailFailedCount} email(s) could not be delivered).`
      : `Successfully sent ${invitedCount} invitation(s).`;

  return {
    success: true,
    totalEligible: eligible.length,
    invitedCount,
    failedCount,
    emailFailedCount,
    message,
  };
}
