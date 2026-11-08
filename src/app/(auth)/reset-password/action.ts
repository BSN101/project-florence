"use server";

import { redirect } from "next/navigation";
import { updatePasswordSchema } from "@/features/auth/auth-schemas";
import { createUserClient } from "@/server/db/user-client";

export async function updatePassword(formData: FormData) {
  const parsed = updatePasswordSchema.safeParse({
    password: formData.get("password"),
    confirmation: formData.get("confirmation"),
  });
  if (!parsed.success) redirect("/reset-password?status=invalid");

  const client = await createUserClient();
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError || !user || user.is_anonymous) redirect("/reset-password?status=invalid-link");

  const { error } = await client.auth.updateUser({ password: parsed.data.password });
  if (error) redirect("/reset-password?status=error");
  await client.auth.signOut();
  redirect("/sign-in?reset=success");
}
