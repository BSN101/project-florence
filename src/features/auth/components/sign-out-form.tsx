"use client";

import { signOut } from "../actions";

/**
 * Signs out, then loads the sign-in page in full. A soft redirect would leave previously visited
 * pages preserved (hidden) in this tab's memory, which matters on shared computers.
 */
export function SignOutForm({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <form className={className} action={async () => {
      await signOut();
      window.location.replace("/sign-in");
    }}>
      {children}
    </form>
  );
}
