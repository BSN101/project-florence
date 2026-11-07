"use server";

import { redirect } from "next/navigation";
import { createUserClient } from "@/server/db/user-client";

// Invoke only through a POST Server Action form; Next.js checks Origin against Host.
export async function signOut() {
  const client = await createUserClient();
  await client.auth.signOut();
  redirect("/sign-in");
}
