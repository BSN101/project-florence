import { connection } from "next/server";
import { ShieldAlert } from "lucide-react";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { PaymentAccountList } from "@/features/finance/components/payment-account-list";
import { getPaymentAccounts } from "@/features/finance/queries";
import { getAccessContext } from "@/server/auth/access-context";

export const instant = false;

export default async function CouncilPaymentAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ semester?: string | string[] }>;
}) {
  await connection();
  const { semester } = await searchParams;
  const access = await getAccessContext();

  if (access.status !== "ready" || !access.workspaces.includes("council")) {
    return (
      <WorkspaceShell
        workspace="council"
        destination="payment-accounts"
        semester={semester}
      />
    );
  }

  // FL-047: Council Executives only; Operations and Representatives do not manage destinations.
  const isExecutive = access.councilRole === "executive";

  if (!isExecutive) {
    return (
      <WorkspaceShell
        workspace="council"
        destination="payment-accounts"
        semester={semester}
      >
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center max-w-lg mx-auto my-12">
          <ShieldAlert className="size-10 text-destructive mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-foreground mb-1">
            Executive Access Required
          </h2>
          <p className="text-sm text-muted-foreground">
            Payment account administration is restricted to Council Executives.
            Operations and Representatives do not manage destination accounts.
          </p>
        </div>
      </WorkspaceShell>
    );
  }

  const accounts = await getPaymentAccounts({ includeArchived: true });

  return (
    <WorkspaceShell
      workspace="council"
      destination="payment-accounts"
      semester={semester}
    >
      <PaymentAccountList accounts={accounts} canManage={true} />
    </WorkspaceShell>
  );
}
