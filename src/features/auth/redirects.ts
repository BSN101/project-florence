import "server-only";

import { redirect } from "next/navigation";

import { getAccessContext } from "@/server/auth/access-context";

import { defaultWorkspaceDestination } from "./destinations";

export async function redirectAuthenticatedUser() {
  const access = await getAccessContext();
  if (access.status === "unauthenticated") return;
  if (access.status === "unavailable") redirect("/access-unavailable");
  if (access.status === "error") throw new Error("Unable to verify Florence access. Try again later.");
  redirect(defaultWorkspaceDestination(access.workspaces));
}
