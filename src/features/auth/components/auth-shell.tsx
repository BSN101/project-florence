import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-12 sm:py-20">
      <Link href="/" className="mb-10 w-fit font-heading text-lg font-semibold text-primary hover:underline">Project Florence</Link>
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-9">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-primary">Faculty of Nursing</p>
        <h1 className="page-title">{title}</h1>
        <p className="mt-3 text-muted-foreground">{description}</p>
        <div className="mt-8">{children}</div>
      </div>
    </main>
  );
}

export const fieldClass = "min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
export const buttonClass = "inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 py-2 font-medium text-primary-foreground hover:opacity-90";
