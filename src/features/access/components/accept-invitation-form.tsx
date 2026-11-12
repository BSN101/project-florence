"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";

import { buttonClass, fieldClass } from "@/features/auth/components/auth-shell";

import { acceptInvitation, checkInvitation, type AcceptInvitationState, type InvitationCheck } from "../invitation-actions";

const errors: Record<NonNullable<AcceptInvitationState["error"]>, string> = {
  invalid: "This invitation is no longer valid. Ask your administrator to send a new one.",
  password: "Passwords must match and be between 12 and 72 UTF-8 bytes.",
  conflict: "This invitation can't be completed because a sign-in account already uses this email. Contact your administrator.",
  service: "We couldn't set up your account right now. Please try again.",
};

export function AcceptInvitationForm() {
  const [token, setToken] = useState<string | null>(null);
  const [check, setCheck] = useState<InvitationCheck | "loading">("loading");
  const [state, formAction, isPending] = useActionState(acceptInvitation, {});

  useEffect(() => {
    // The token lives in the fragment, which never reaches the server or its logs.
    const value = new URLSearchParams(window.location.hash.slice(1)).get("t");
    let active = true;
    Promise.resolve(value ? checkInvitation(value) : { usable: false } as const)
      .then((result) => {
        if (!active) return;
        setToken(value);
        setCheck(result);
      })
      .catch(() => { if (active) setCheck({ usable: false }); });
    return () => { active = false; };
  }, []);

  if (check === "loading") return <p role="status" className="text-muted-foreground">Checking your invitation…</p>;
  if (!check.usable || !token) {
    return (
      <>
        <p role="alert" className="rounded-lg bg-error-surface p-3">{errors.invalid}</p>
        <Link className="mt-6 inline-block font-medium text-primary underline" href="/sign-in">Already set up? Sign in</Link>
      </>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.error && <p role="alert" className="rounded-lg bg-error-surface p-3">{errors[state.error]}</p>}
      <p>Hello {check.firstName}. Choose a password for <strong>{check.email}</strong>.</p>
      <input type="hidden" name="token" value={token} />
      <label className="flex flex-col gap-2 font-medium">Password
        <input className={fieldClass} type="password" name="password" autoComplete="new-password" required minLength={12} maxLength={72} />
      </label>
      <label className="flex flex-col gap-2 font-medium">Confirm password
        <input className={fieldClass} type="password" name="confirmation" autoComplete="new-password" required minLength={12} maxLength={72} />
      </label>
      <button className={buttonClass} type="submit" disabled={isPending}>{isPending ? "Setting up…" : "Set password"}</button>
    </form>
  );
}
