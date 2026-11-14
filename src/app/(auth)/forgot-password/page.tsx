import Link from "next/link";
import { requestReset } from "@/features/auth/actions";
import { AuthShell, fieldClass } from "@/features/auth/components/auth-shell";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { redirectAuthenticatedUser } from "@/features/auth/redirects";

export const instant = false;

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  await redirectAuthenticatedUser();
  return (
    <AuthShell title="Reset your password" description="Enter your account email address and we’ll send you a recovery link if an account exists.">
      {status === "sent" && <p role="status" className="mb-5 rounded-lg bg-success p-3">If an account exists, check your email for a recovery link.</p>}
      {status === "invalid" && <p role="alert" className="mb-5 rounded-lg bg-error-surface p-3">Enter a valid email address.</p>}
      {status === "error" && <p role="alert" className="mb-5 rounded-lg bg-error-surface p-3">We couldn’t send the email right now. Please try again later.</p>}
      <form action={requestReset} className="flex flex-col gap-5">
        <label className="flex flex-col gap-2 font-medium">Email address
          <input className={fieldClass} type="email" name="email" autoComplete="email" required maxLength={254} />
        </label>
        <SubmitButton pendingLabel="Sending link…">Send recovery link</SubmitButton>
      </form>
      <Link className="mt-6 inline-block font-medium text-primary underline" href="/sign-in">Back to sign in</Link>
    </AuthShell>
  );
}
