import Link from "next/link";
import { connection } from "next/server";
import { createUserClient } from "@/server/db/user-client";
import { AuthShell, buttonClass, fieldClass } from "../auth-ui";
import { updatePassword } from "./action";

export const instant = false;

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await connection();
  const { status } = await searchParams;
  const client = await createUserClient();
  const { data: { user }, error } = await client.auth.getUser();
  const verified = !error && !!user && !user.is_anonymous;
  return (
    <AuthShell title={verified && status !== "invalid-link" ? "Change your password" : "Choose a new password"} description="Sign in or use your recovery link to set a new password for your account.">
      {status === "invalid-link" && <p role="alert" className="mb-5 rounded-lg bg-error-surface p-3">That recovery link is invalid or expired. Request a new one.</p>}
      {status === "invalid" && <p role="alert" className="mb-5 rounded-lg bg-error-surface p-3">Passwords must match and be between 12 and 72 characters.</p>}
      {status === "error" && <p role="alert" className="mb-5 rounded-lg bg-error-surface p-3">We couldn’t update your password. Please try again.</p>}
      {verified ? (
        <form action={updatePassword} className="flex flex-col gap-5">
          <label className="flex flex-col gap-2 font-medium">New password
            <input className={fieldClass} type="password" name="password" autoComplete="new-password" required minLength={12} maxLength={72} />
          </label>
          <label className="flex flex-col gap-2 font-medium">Confirm new password
            <input className={fieldClass} type="password" name="confirmation" autoComplete="new-password" required minLength={12} maxLength={72} />
          </label>
          <button className={buttonClass} type="submit">Update password</button>
        </form>
      ) : <p className="text-muted-foreground">No verified session is available. Open the link in your recovery email or request another one.</p>}
      <Link className="mt-6 inline-block font-medium text-primary underline" href="/forgot-password">Request a recovery link</Link>
    </AuthShell>
  );
}
