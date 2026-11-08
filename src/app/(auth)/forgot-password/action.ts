"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { passwordResetRequestSchema } from "@/features/auth/auth-schemas";
import { createUserClient } from "@/server/db/user-client";

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
