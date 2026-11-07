"use server";

import { redirect } from "next/navigation";
import { getAccessContext } from "@/server/auth/access-context";
import { createUserClient } from "@/server/db/user-client";

import { safeDestination } from "./destination";

export async function signIn(formData: FormData) {
  const email = formData.get("email");
  const password = formData.get("password");
  const next = safeDestination(formData.get("next"));
  const errorUrl = (error: string) => `/sign-in?${new URLSearchParams({ error, ...(next ? { next } : {}) })}`;

  if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    typeof password !== "string" || !password || password.length > 1024) {
    redirect(errorUrl("invalid"));
  }

  const client = await createUserClient();
  const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
  if (error) redirect(errorUrl("credentials"));

  const access = await getAccessContext();
  if (access.status === "ready") {
    redirect(next && access.workspaces.includes(next.slice(1) as (typeof access.workspaces)[number])
      ? next : `/${access.workspaces[0]}`);
  }
  if (access.status === "unavailable") redirect("/access-unavailable");
  redirect(errorUrl("service"));
}
