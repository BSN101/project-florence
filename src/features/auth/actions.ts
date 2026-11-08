"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAccessContext } from "@/server/auth/access-context";
import { createUserClient } from "@/server/db/user-client";

import { authorizedDestination, defaultWorkspaceDestination, safeDestination } from "./destinations";
import {
  recoveryIntentCookieName,
  recoveryIntentCookieOptions,
  verifyRecoveryIntent,
} from "./recovery-intent";
import {
  passwordResetRequestSchema,
  signInSchema,
  passwordRecoverySchema,
} from "./schemas";

export async function signIn(formData: FormData) {
  const next = safeDestination(formData.get("next"));
  const errorUrl = (error: string) => `/sign-in?${new URLSearchParams({ error, ...(next ? { next } : {}) })}`;
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) redirect(errorUrl("invalid"));

  const client = await createUserClient();
  const { error } = await client.auth.signInWithPassword(parsed.data);
  if (error) redirect(errorUrl("credentials"));

  const access = await getAccessContext();
  if (access.status === "ready") {
    redirect(authorizedDestination(next, access.workspaces) ?? defaultWorkspaceDestination(access.workspaces));
  }
  if (access.status === "unavailable") redirect("/access-unavailable");
  redirect(errorUrl("service"));
}

export async function requestReset(formData: FormData) {
  const parsed = passwordResetRequestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) redirect("/forgot-password?status=invalid");

  // Next.js checks Server Action Origin against Host; never use a submitted callback URL.
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  const host = requestHeaders.get("host");
  if (!origin || !host || !/^https?:\/\/[^/]+$/.test(origin) || new URL(origin).host !== host) {
    redirect("/forgot-password?status=error");
  }
  const client = await createUserClient();
  const { error } = await client.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: new URL("/reset-password/callback", origin).toString(),
  });
  redirect(error ? "/forgot-password?status=error" : "/forgot-password?status=sent");
}

export async function completePasswordRecovery(formData: FormData) {
  const parsed = passwordRecoverySchema.safeParse({
    password: formData.get("password"),
    confirmation: formData.get("confirmation"),
  });
  if (!parsed.success) redirect("/reset-password?status=invalid");

  const client = await createUserClient();
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError || !user || user.is_anonymous) redirect("/reset-password?status=invalid-link");

  const cookieStore = await cookies();
  const recoveryIntent = cookieStore.get(recoveryIntentCookieName)?.value;
  if (!verifyRecoveryIntent(recoveryIntent, user.id)) redirect("/reset-password?status=invalid-link");

  const { error } = await client.auth.updateUser({ password: parsed.data.password });
  if (error) redirect("/reset-password?status=error");

  cookieStore.set(recoveryIntentCookieName, "", { ...recoveryIntentCookieOptions, maxAge: 0 });
  await client.auth.signOut();
  redirect("/sign-in?reset=success");
}

// Invoke only through a POST Server Action form; Next.js checks Origin against Host.
export async function signOut() {
  const client = await createUserClient();
  await client.auth.signOut();
  redirect("/sign-in");
}
