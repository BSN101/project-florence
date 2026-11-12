import Link from "next/link";
import { signIn } from "@/features/auth/actions";
import { AuthShell, buttonClass, fieldClass } from "@/features/auth/components/auth-shell";
import { safeDestination } from "@/features/auth/destinations";
import { redirectAuthenticatedUser } from "@/features/auth/redirects";

export const instant = false;

const messages: Record<string, string> = {
  invalid: "Enter a valid email address and password.",
  credentials: "We couldn't sign you in with those credentials.",
  unavailable: "This account does not have an active Florence workspace. Contact an administrator.",
  service: "We couldn't check your access right now. Please try again later.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; reset?: string; invited?: string }> }) {
  const params = await searchParams;
  await redirectAuthenticatedUser();
  const next = safeDestination(params.next);
  return (
    <AuthShell title="Sign in" description="Access your nursing records and permitted workspace with your Florence account.">
      {params.reset === "success" && <p role="status" className="mb-5 rounded-lg bg-success p-3">Password updated. Sign in with your new password.</p>}
      {params.invited === "success" && <p role="status" className="mb-5 rounded-lg bg-success p-3">Your account is ready. Sign in with your new password.</p>}
      {params.error && messages[params.error] && <p role="alert" className="mb-5 rounded-lg bg-error-surface p-3 text-foreground">{messages[params.error]}</p>}
      <form action={signIn} className="flex flex-col gap-5">
        {next && <input type="hidden" name="next" value={next} />}
        <label className="flex flex-col gap-2 font-medium">Email address
          <input className={fieldClass} type="email" name="email" autoComplete="email" required maxLength={254} />
        </label>
        <label className="flex flex-col gap-2 font-medium">Password
          <input className={fieldClass} type="password" name="password" autoComplete="current-password" required />
        </label>
        <button className={buttonClass} type="submit">Sign in</button>
      </form>
      <p className="mt-6 text-muted-foreground">Forgot your password? <Link className="font-medium text-primary underline" href="/forgot-password">Reset it by email</Link>.</p>
    </AuthShell>
  );
}
