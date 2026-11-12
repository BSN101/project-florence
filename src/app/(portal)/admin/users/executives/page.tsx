import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { ExecutivesTable } from "@/features/access/components/executives-table";
import { listProvisioningAccounts } from "@/features/access/provisioning-service";

export const instant = false;

export default function AdminExecutivesPage() {
  return (
    <WorkspaceShell workspace="admin" destination="users/executives">
      <p className="text-sm text-muted-foreground">
        Students who currently hold Council Executive access. To grant it, use the student’s exact university number. Platform Admin doesn’t browse the student roster; Council manages other Council access.
      </p>
      <ExecutiveAccounts />
    </WorkspaceShell>
  );
}

// Rendered inside the shell, which has already checked workspace access.
async function ExecutiveAccounts() {
  const accounts = await listProvisioningAccounts().catch(() => null);
  if (!accounts) return <p role="alert" className="rounded-lg bg-error-surface p-3 text-sm">We couldn’t load Executive accounts. Please try again.</p>;
  return <ExecutivesTable accounts={accounts.filter((a) => a.university_id !== null)} />;
}
