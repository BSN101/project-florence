import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { FacultyTable } from "@/features/access/components/faculty-table";
import { listProvisioningAccounts } from "@/features/access/provisioning-service";

export const instant = false;

export default function AdminFacultyPage() {
  return (
    <WorkspaceShell workspace="admin" destination="users/faculty">
      <p className="text-sm text-muted-foreground">
        Faculty accounts, their instructor and coordinator roles, and their invitations. New Faculty choose their own password from the invitation email.
      </p>
      <FacultyAccounts />
    </WorkspaceShell>
  );
}

// Rendered inside the shell, which has already checked workspace access.
async function FacultyAccounts() {
  const accounts = await listProvisioningAccounts().catch(() => null);
  if (!accounts) return <p role="alert" className="rounded-lg bg-error-surface p-3 text-sm">We couldn’t load Faculty accounts. Please try again.</p>;
  return <FacultyTable accounts={accounts.filter((a) => a.university_id === null)} />;
}
