import { AcceptInvitationForm } from "@/features/access/components/accept-invitation-form";
import { AuthShell } from "@/features/auth/components/auth-shell";

export const instant = false;

export default function AcceptInvitationPage() {
  return (
    <AuthShell title="Set up your account" description="Choose the password you'll use to sign in to Project Florence. Invitation links work once and expire.">
      <AcceptInvitationForm />
    </AuthShell>
  );
}
