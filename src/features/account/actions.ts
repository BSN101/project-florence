"use server";

import { redirect } from "next/navigation";

import { getAccessContext } from "@/server/auth/access-context";
import { createUserClient } from "@/server/db/user-client";

import { changePasswordSchema } from "./schemas";

export async function changePassword(formData: FormData) {
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmation: formData.get("confirmation"),
  });
  if (!parsed.success) redirect("/account?status=invalid#password");

  const client = await createUserClient();
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError || !user || user.is_anonymous) redirect("/sign-in?next=/account");

  const access = await getAccessContext();
  if (access.status === "unauthenticated") redirect("/sign-in?next=/account");
  if (access.status === "unavailable") redirect("/access-unavailable");
  if (access.status === "error") redirect("/account?status=service#password");

  const { error } = await client.auth.updateUser({
    password: parsed.data.newPassword,
    current_password: parsed.data.currentPassword,
  });
  if (error) redirect("/account?status=error#password");
  redirect("/account?status=password-updated#password");
}
