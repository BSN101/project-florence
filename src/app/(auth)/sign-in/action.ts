"use server";

import { redirect } from "next/navigation";
import { signInSchema } from "@/features/auth/auth-schemas";
import { getAccessContext } from "@/server/auth/access-context";
import { createUserClient } from "@/server/db/user-client";

import { safeDestination } from "./destination";

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
    redirect(next && access.workspaces.includes(next.slice(1) as (typeof access.workspaces)[number])
      ? next : `/${access.workspaces[0]}`);
  }
  if (access.status === "unavailable") redirect("/access-unavailable");
  redirect(errorUrl("service"));
}
