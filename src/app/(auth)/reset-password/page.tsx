import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { completePasswordRecovery } from "@/features/auth/actions";
import { AuthShell, fieldClass } from "@/features/auth/components/auth-shell";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { recoveryIntentCookieName, verifyRecoveryIntent } from "@/features/auth/recovery-intent";
import { createUserClient } from "@/server/db/user-client";

export const instant = false;

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await connection();
  const [{ status }, cookieStore, client] = await Promise.all([searchParams, cookies(), createUserClient()]);
  const { data: { user }, error } = await client.auth.getUser();
  const verified = !error && !!user && !user.is_anonymous;
  const recoveryIntent = verified && verifyRecoveryIntent(
    cookieStore.get(recoveryIntentCookieName)?.value,
    user.id,
  );

  if (verified && !recoveryIntent) redirect("/account#password");

  return (
    <AuthShell title="Choose a new password" description="Use the verified recovery link from your email to set a new password. This flow signs you out when it finishes.">
      {status === "invalid-link" && <p role="alert" className="mb-5 rounded-lg bg-error-surface p-3">That recovery link is invalid or expired. Request a new one.</p>}
      {status === "invalid" && <p role="alert" className="mb-5 rounded-lg bg-error-surface p-3">Passwords must match and be between 12 and 72 UTF-8 bytes.</p>}
      {status === "error" && <p role="alert" className="mb-5 rounded-lg bg-error-surface p-3">We couldn’t update your password. Please try again.</p>}
      {recoveryIntent ? (
        <form action={completePasswordRecovery} className="flex flex-col gap-5">
          <label className="flex flex-col gap-2 font-medium">New password
            <input className={fieldClass} type="password" name="password" autoComplete="new-password" required minLength={12} maxLength={72} />
          </label>
          <label className="flex flex-col gap-2 font-medium">Confirm new password
            <input className={fieldClass} type="password" name="confirmation" autoComplete="new-password" required minLength={12} maxLength={72} />
          </label>
          <SubmitButton pendingLabel="Resetting password…">Reset password</SubmitButton>
        </form>
      ) : <p className="text-muted-foreground">No valid recovery session is available. Open the latest link in your recovery email or request another one.</p>}
      <Link className="mt-6 inline-block font-medium text-primary underline" href="/forgot-password">Request a recovery link</Link>
    </AuthShell>
  );
}
