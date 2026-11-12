import "server-only";

import { AccessDeniedError, requireWorkspace } from "@/server/auth/require-workspace";
import { createUserClient } from "@/server/db/user-client";

import type { CouncilMember, ProvisioningResult, StudentCandidate } from "./provisioning-contracts";
import { addCouncilMemberSchema, changeCouncilMemberSchema, councilRoleNames, removeCouncilMemberSchema } from "./provisioning-schemas";
import { invalid, runCommand } from "./provisioning-service";

/** The Council workspace alone is not authority; only a current Executive manages members. */
export async function requireCouncilExecutive() {
  const context = await requireWorkspace("council");
  if (context.councilRole !== "executive") throw new AccessDeniedError("forbidden");
  return context;
}

export async function listCouncilMembers(): Promise<CouncilMember[]> {
  await requireCouncilExecutive();
  const client = await createUserClient();
  const { data, error } = await client.rpc("florence_council_members");
  if (error) throw new Error("Unable to load Council members");
  return data;
}

/** Exact-number lookup only, mirroring the Platform Admin Executive grant. */
export async function lookupCouncilCandidate(universityId: string): Promise<StudentCandidate | null> {
  await requireCouncilExecutive();
  const parsed = addCouncilMemberSchema.shape.universityId.safeParse(universityId);
  if (!parsed.success) return null;
  const client = await createUserClient();
  const { data, error } = await client.rpc("florence_council_candidate", { p_university_id: parsed.data });
  if (error) throw new Error("Unable to look up the student");
  return data[0] ?? null;
}

// Commands run through the service-role client; the actor comes from the session.

export async function addCouncilMember(input: unknown): Promise<ProvisioningResult> {
  const actor = await requireCouncilExecutive();
  const parsed = addCouncilMemberSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const v = parsed.data;
  const { failure } = await runCommand("council_add_member", {
    p_key: v.requestKey, p_actor: actor.profile.id, p_university_id: v.universityId, p_role: v.role, p_label: v.label,
  }, "/council");
  return failure ?? { success: true, message: `${councilRoleNames[v.role]} access granted. The student was notified in Florence.` };
}

export async function changeCouncilMember(input: unknown): Promise<ProvisioningResult> {
  const actor = await requireCouncilExecutive();
  const parsed = changeCouncilMemberSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const v = parsed.data;
  const { result, failure } = await runCommand("council_change_member", {
    p_key: v.requestKey, p_actor: actor.profile.id, p_membership: v.membershipId, p_role: v.role, p_label: v.label,
  }, "/council");
  if (failure) return failure;
  return { success: true, message: result!.changed === false ? "Nothing changed." : "Council access updated. The student was notified in Florence." };
}

export async function removeCouncilMember(input: unknown): Promise<ProvisioningResult> {
  const actor = await requireCouncilExecutive();
  const parsed = removeCouncilMemberSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { failure } = await runCommand("council_remove_member", {
    p_key: parsed.data.requestKey, p_actor: actor.profile.id, p_membership: parsed.data.membershipId,
  }, "/council");
  return failure ?? { success: true, message: "Council access removed. The student keeps their Student account and history." };
}
