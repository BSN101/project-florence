"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { passwordRecoverySchema } from "@/features/auth/schemas";
import { createCommandClient } from "@/server/db/command-client";

import { hashInvitationToken, invitationTokenPattern } from "./invitation-token";

// Public entry points: the invitation token is the only credential, so every
// call re-checks it in the database. Never log the token.
const tokenSchema = z.string().regex(invitationTokenPattern);

export type InvitationCheck = { usable: false } | { usable: true; email: string; firstName: string };
export type AcceptInvitationState = { error?: "invalid" | "password" | "conflict" | "service" };

export async function checkInvitation(token: unknown): Promise<InvitationCheck> {
  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) return { usable: false };
  const { data, error } = await createCommandClient()
    .rpc("check_invitation", { p_token_hash: hashInvitationToken(parsed.data) });
  const result = data as { usable?: boolean; email?: string; first_name?: string } | null;
  if (error || !result?.usable || !result.email || !result.first_name) return { usable: false };
  return { usable: true, email: result.email, firstName: result.first_name };
}

export async function acceptInvitation(_previous: AcceptInvitationState, formData: FormData): Promise<AcceptInvitationState> {
  const token = tokenSchema.safeParse(formData.get("token"));
  if (!token.success) return { error: "invalid" };
  const password = passwordRecoverySchema.safeParse({
    password: formData.get("password"),
    confirmation: formData.get("confirmation"),
  });
  if (!password.success) return { error: "password" };

  const tokenHash = hashInvitationToken(token.data);
  const client = createCommandClient();
  const check = await checkInvitation(token.data);
  if (!check.usable) return { error: "invalid" };

  // The Auth user exists only from here on; before acceptance there is nothing to
  // sign in to or recover, so a cancelled invitation can't be bypassed.
  const { data: created, error: createError } = await client.auth.admin.createUser({
    email: check.email, password: password.data.password, email_confirm: true,
  });
  if (createError || !created.user) {
    // Never touch an existing Auth user: that would let a token holder take it over.
    if (createError?.code === "email_exists" || createError?.code === "user_already_exists") return { error: "conflict" };
    if (createError?.code === "weak_password") return { error: "password" };
    return { error: "service" };
  }

  const userId = created.user.id;
  const { error: acceptError } = await client.rpc("accept_invitation", {
    p_token_hash: tokenHash, p_auth_user_id: userId,
  });
  if (acceptError) {
    // The accept may have committed even though the response failed. Delete the
    // new user only if no profile links to it; deleting a linked user would
    // strand the profile, because auth_user_id has no foreign key to Auth.
    const { data: linked, error: linkError } = await client.from("profiles")
      .select("id").eq("auth_user_id", userId).maybeSingle();
    if (linkError) return { error: "service" };
    if (!linked) {
      await client.auth.admin.deleteUser(userId);
      return { error: "invalid" };
    }
  }
  redirect("/sign-in?invited=success");
}
