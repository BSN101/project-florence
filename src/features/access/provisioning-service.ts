import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { trustedRequestOrigin } from "@/features/auth/request-origin";
import { AccessDeniedError, requireWorkspace } from "@/server/auth/require-workspace";
import { createCommandClient } from "@/server/db/command-client";
import { createUserClient } from "@/server/db/user-client";
import { sendInvitationEmail } from "@/server/email/invitation-email";

import { createInvitationToken } from "./invitation-token";
import type { ArchiveBlockers, ExecutiveCandidate, ProvisioningAccount, ProvisioningResult } from "./provisioning-contracts";
import {
  cancelInvitationSchema, changeFacultyAssignmentsSchema, grantExecutiveSchema,
  profileCommandSchema, provisionFacultySchema, replaceExecutiveSchema, updateFacultyIdentitySchema,
} from "./provisioning-schemas";

/** Workspace access alone is not authority; every entry point re-checks the role. */
export async function requirePlatformAdmin() {
  const context = await requireWorkspace("admin");
  if (!context.roles.includes("Platform Admin")) throw new AccessDeniedError("forbidden");
  return context;
}

// Reads use the request-scoped client and the Platform-Admin-only list RPC.
export async function listProvisioningAccounts(): Promise<ProvisioningAccount[]> {
  await requirePlatformAdmin();
  const client = await createUserClient();
  const { data, error } = await client.rpc("florence_provisioning_accounts");
  if (error) throw new Error("Unable to load accounts");
  return data;
}

/** Exact-number lookup only: Platform Admin confirms one student, never browses the roster. */
export async function lookupExecutiveCandidate(universityId: string): Promise<ExecutiveCandidate | null> {
  await requirePlatformAdmin();
  const parsed = grantExecutiveSchema.shape.universityId.safeParse(universityId);
  if (!parsed.success) return null;
  const client = await createUserClient();
  const { data, error } = await client.rpc("florence_executive_candidate", { p_university_id: parsed.data });
  if (error) throw new Error("Unable to look up the student");
  return data[0] ?? null;
}

export async function getArchivePreview(profileId: string): Promise<ArchiveBlockers | null> {
  const actor = await requirePlatformAdmin();
  const { data, error } = await createCommandClient()
    .rpc("faculty_archive_preview", { p_actor: actor.profile.id, p_profile: profileId });
  return error ? null : data as ArchiveBlockers;
}

// Commands run through the service-role client after authorization. The actor
// always comes from the verified session, never from the browser.

type CommandResult = { replayed?: boolean; profile_id?: string; invitation_id?: string } & Record<string, unknown>;

// Our RPCs raise user-safe messages for these SQLSTATEs; anything else stays generic.
const userSafeCodes = new Set(["22023", "55000", "0A000"]);
function commandError(error: PostgrestError): ProvisioningResult {
  if (error.code === "42501") return { success: false, error: "You are not permitted to make this change." };
  // A concurrent grant can still hit the index after the readable pre-check.
  if (error.code === "23505" && error.message.includes("executive_position")) return { success: false, error: "Another current Executive already holds that position." };
  if (error.code === "23505") return { success: false, error: "That email already belongs to a Florence profile or sign-in account." };
  if (error.message === "Archive blocked by pending work" && error.details) {
    try {
      return { success: false, error: "This instructor still has pending work. Resolve it before archiving.", blockers: JSON.parse(error.details) };
    } catch { /* fall through to the generic message */ }
  }
  if (error.code && userSafeCodes.has(error.code)) return { success: false, error: error.message };
  return { success: false, error: "We couldn't complete that change. Please try again." };
}

async function runCommand(fn: string, args: Record<string, unknown>): Promise<{ result?: CommandResult; failure?: ProvisioningResult }> {
  const client = createCommandClient();
  // Names come from this file only; the typed overloads don't accept a union of RPC names.
  const { data, error } = await (client.rpc as unknown as (f: string, a: Record<string, unknown>) =>
    Promise<{ data: unknown; error: PostgrestError | null }>)(fn, args);
  if (error) return { failure: commandError(error) };
  revalidatePath("/admin", "layout");
  return { result: data as CommandResult };
}

const invalid = (error: { issues: { message: string }[] }): ProvisioningResult =>
  ({ success: false, error: error.issues[0]?.message ?? "Check the form and try again." });

/** Sends after the database commit; a delivery failure never undoes the account. */
async function deliverInvitation(result: CommandResult, invitation: { token: string; expiresAt: string },
  to: string, firstName: string, done: string): Promise<ProvisioningResult> {
  if (result.replayed) return { success: true, message: `${done} This was a repeated request, so no email was sent. Use Reissue invitation to send a new link.` };
  const origin = await trustedRequestOrigin();
  if (!origin) return { success: true, message: `${done} The invitation email couldn't be sent. Use Reissue invitation to try again.` };
  try {
    await sendInvitationEmail({ origin, to, firstName, token: invitation.token, expiresAt: invitation.expiresAt });
    return { success: true, message: `${done} An invitation email was sent to ${to}.` };
  } catch {
    return { success: true, message: `${done} The invitation email couldn't be sent. Use Reissue invitation to try again.` };
  }
}

export async function provisionFaculty(input: unknown): Promise<ProvisioningResult> {
  const actor = await requirePlatformAdmin();
  const parsed = provisionFacultySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const v = parsed.data;
  const invitation = createInvitationToken();
  const { result, failure } = await runCommand("provision_faculty", {
    p_key: v.requestKey, p_actor: actor.profile.id, p_first_name: v.firstName, p_middle_name: v.middleName,
    p_last_name: v.lastName, p_suffix: v.suffix, p_email: v.email, p_instructor_role: v.instructorRole,
    p_coordinator: v.coordinator, p_token_hash: invitation.tokenHash, p_expires_at: invitation.expiresAt,
  });
  if (failure) return failure;
  return deliverInvitation(result!, invitation, v.email, v.firstName, "Faculty account created.");
}

export async function reissueInvitation(input: unknown): Promise<ProvisioningResult> {
  const actor = await requirePlatformAdmin();
  const parsed = profileCommandSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  // Recipient comes from the database, never from the browser.
  const profile = (await listProvisioningAccounts()).find((account) => account.id === parsed.data.profileId);
  if (!profile?.email) return { success: false, error: "Profile not found or has no email." };
  const invitation = createInvitationToken();
  const { result, failure } = await runCommand("reissue_invitation", {
    p_key: parsed.data.requestKey, p_actor: actor.profile.id, p_profile: profile.id,
    p_token_hash: invitation.tokenHash, p_expires_at: invitation.expiresAt,
  });
  if (failure) return failure;
  return deliverInvitation(result!, invitation, profile.email, profile.first_name, "New invitation created; the previous link no longer works.");
}

export async function updateFacultyIdentity(input: unknown): Promise<ProvisioningResult> {
  const actor = await requirePlatformAdmin();
  const parsed = updateFacultyIdentitySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const v = parsed.data;
  const { result, failure } = await runCommand("update_faculty_identity", {
    p_key: v.requestKey, p_actor: actor.profile.id, p_profile: v.profileId, p_first_name: v.firstName,
    p_middle_name: v.middleName, p_last_name: v.lastName, p_suffix: v.suffix, p_email: v.email,
  });
  if (failure) return failure;
  return { success: true, message: result!.invitation_closed
    ? "Details saved. The email changed, so the old invitation was cancelled; use Reissue invitation to send a new one."
    : "Details saved." };
}

export async function changeFacultyAssignments(input: unknown): Promise<ProvisioningResult> {
  const actor = await requirePlatformAdmin();
  const parsed = changeFacultyAssignmentsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const v = parsed.data;
  const { failure } = await runCommand("change_faculty_assignments", {
    p_key: v.requestKey, p_actor: actor.profile.id, p_profile: v.profileId,
    p_instructor_role: v.instructorRole, p_coordinator: v.coordinator,
  });
  return failure ?? { success: true, message: "Access updated." };
}

export async function archiveFaculty(input: unknown): Promise<ProvisioningResult> {
  const actor = await requirePlatformAdmin();
  const parsed = profileCommandSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { failure } = await runCommand("archive_faculty", {
    p_key: parsed.data.requestKey, p_actor: actor.profile.id, p_profile: parsed.data.profileId,
  });
  return failure ?? { success: true, message: "Faculty account archived. Its access was removed and its history is kept." };
}

export async function cancelInvitation(input: unknown): Promise<ProvisioningResult> {
  const actor = await requirePlatformAdmin();
  const parsed = cancelInvitationSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { failure } = await runCommand("cancel_invitation", {
    p_key: parsed.data.requestKey, p_actor: actor.profile.id, p_invitation: parsed.data.invitationId,
  });
  return failure ?? { success: true, message: "Invitation cancelled. Its link no longer works." };
}

export async function grantExecutive(input: unknown): Promise<ProvisioningResult> {
  const actor = await requirePlatformAdmin();
  const parsed = grantExecutiveSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { failure } = await runCommand("grant_executive", {
    p_key: parsed.data.requestKey, p_actor: actor.profile.id,
    p_university_id: parsed.data.universityId, p_label: parsed.data.label,
  });
  return failure ?? { success: true, message: "Executive access granted." };
}

export async function replaceExecutive(input: unknown): Promise<ProvisioningResult> {
  const actor = await requirePlatformAdmin();
  const parsed = replaceExecutiveSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const v = parsed.data;
  const { failure } = await runCommand("replace_executive", {
    p_key: v.requestKey, p_actor: actor.profile.id, p_profile: v.profileId, p_access_role: v.accessRole, p_label: v.label,
  });
  return failure ?? { success: true, message: `Executive access replaced with ${v.accessRole === "operations" ? "Operations" : "Representative"}.` };
}

export async function removeExecutive(input: unknown): Promise<ProvisioningResult> {
  const actor = await requirePlatformAdmin();
  const parsed = profileCommandSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { failure } = await runCommand("remove_executive", {
    p_key: parsed.data.requestKey, p_actor: actor.profile.id, p_profile: parsed.data.profileId,
  });
  return failure ?? { success: true, message: "Executive access removed. The student's account and history are unchanged." };
}
