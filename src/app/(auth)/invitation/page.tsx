import Link from "next/link";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { redirectAuthenticatedUser } from "@/features/auth/redirects";

export const instant = false;

export default async function InvitationPage() {
  await redirectAuthenticatedUser();
  return (
    <AuthShell title="Invitation acceptance is not yet available" description="Florence accounts are created through approved provisioning. Invitation acceptance is still being prepared; this page cannot activate an account or set a first password.">
      <p className="text-muted-foreground">If you were expecting an invitation, please contact your Faculty or Council administrator.</p>
      <Link className="mt-6 inline-block font-medium text-primary underline" href="/sign-in">Already have an account? Sign in</Link>
    </AuthShell>
  );
}
