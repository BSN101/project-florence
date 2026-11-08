import Link from "next/link";
import type { ReactNode } from "react";
import { Landmark, LogOut } from "lucide-react";

import { signOut } from "@/features/auth/actions";
import { workspaceLabels } from "@/features/access/workspace-navigation";
import type { AccessContext } from "@/server/auth/access-context";

export function AccountShell({ access, children }: {
  access: Extract<AccessContext, { status: "ready" }>;
  children: ReactNode;
}) {
  return (
    <div className="min-h-svh">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <Link href={`/${access.workspaces[0]}`} className="flex items-center gap-3 font-heading font-semibold text-primary hover:underline">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Landmark className="size-4" /></span>
            Project Florence
          </Link>
          <nav className="flex flex-wrap items-center gap-4" aria-label="Account navigation">
            {access.workspaces.map((workspace) => (
              <Link key={workspace} href={`/${workspace}`} className="font-medium text-muted-foreground hover:text-foreground hover:underline">
                {workspaceLabels[workspace]}
              </Link>
            ))}
            <form action={signOut}>
              <button type="submit" className="inline-flex items-center gap-2 font-medium text-primary hover:underline"><LogOut className="size-4" />Sign out</button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-8 sm:px-8 lg:py-12">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Shared account</p>
          <h1 className="page-title">Account</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">Review your Florence identity and manage your password. Workspace switching does not change your authority.</p>
        </div>
        {children}
      </main>
    </div>
  );
}
