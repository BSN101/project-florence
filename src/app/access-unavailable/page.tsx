import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/app/(auth)/sign-out/action";
import { getAccessContext } from "@/server/auth/access-context";

export const instant = false;

export default async function AccessUnavailablePage() {
  const access = await getAccessContext();
  if (access.status === "unauthenticated") redirect("/sign-in");
  if (access.status === "ready") redirect(`/${access.workspaces[0]}`);
  if (access.status === "error") throw new Error("Unable to verify Florence access. Try again later.");
  return <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-6 px-6 py-16">
    <h1 className="page-title">Access unavailable</h1>
    <p className="text-muted-foreground">Your signed-in account has no active Florence profile or permitted workspace. Contact an administrator if you believe this is a mistake.</p>
    <form action={signOut}><button className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground" type="submit">Sign out</button></form>
    <Link className="text-primary underline" href="/">Back to home</Link>
  </main>;
}
