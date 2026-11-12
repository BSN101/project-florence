import Link from "next/link";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { redirectAuthenticatedUser } from "@/features/auth/redirects";

export const instant = false;

export default async function InvitationPage() {
  await redirectAuthenticatedUser();
  return (
    <AuthShell title="Accepting an invitation" description="Florence accounts are created through approved provisioning. To set up your account, open the link in your invitation email; it lets you choose your own password.">
      <p className="text-muted-foreground">If your link has expired or you can’t find the email, contact your Faculty or Council administrator for a new invitation.</p>
      <Link className="mt-6 inline-block font-medium text-primary underline" href="/sign-in">Already have an account? Sign in</Link>
    </AuthShell>
  );
}
