"use server";

import { redirect } from "next/navigation";
import { createUserClient } from "@/server/db/user-client";

export async function updatePassword(formData: FormData) {
  const password = formData.get("password");
  const confirmation = formData.get("confirmation");
  if (typeof password !== "string" || password.length < 12 || password.length > 72 ||
    password !== confirmation) redirect("/reset-password?status=invalid");

  const client = await createUserClient();
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError || !user || user.is_anonymous) redirect("/reset-password?status=invalid-link");

  const { error } = await client.auth.updateUser({ password });
  if (error) redirect("/reset-password?status=error");
  await client.auth.signOut();
  redirect("/sign-in?reset=success");
}
