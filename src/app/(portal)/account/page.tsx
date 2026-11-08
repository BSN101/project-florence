import { redirect } from "next/navigation";

import { AccountShell } from "@/components/layout/account-shell";
import { AccountDetails } from "@/features/account/components/account-details";
import { ChangePasswordForm } from "@/features/account/components/change-password-form";
import { getAccessContext } from "@/server/auth/access-context";

export const instant = false;

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const [access, params] = await Promise.all([getAccessContext(), searchParams]);
  if (access.status === "unauthenticated") redirect("/sign-in?next=/account");
  if (access.status === "unavailable") redirect("/access-unavailable");
  if (access.status === "error") throw new Error("Unable to verify Florence access. Try again later.");

  return (
    <AccountShell access={access}>
      <AccountDetails access={access} />
      <ChangePasswordForm status={params.status} />
    </AccountShell>
  );
}
