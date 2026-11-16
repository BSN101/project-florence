import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { CouncilMembersTable } from "@/features/access/components/council-members-table";
import { listCouncilMembers } from "@/features/access/council-membership-service";

export const instant = false;

export default async function CouncilMembersPage({ searchParams }: {
  searchParams: Promise<{ semester?: string | string[] }>;
}) {
  const { semester } = await searchParams;
  return (
    <WorkspaceShell workspace="council" destination="council-members" semester={semester}>
      <p className="text-sm text-muted-foreground">
        Students who currently hold Council access. Add Operations or Representative members by exact university number, reassign them or edit their position. Executive access is managed by Platform Admin.
      </p>
      <CouncilMembers />
    </WorkspaceShell>
  );
}

// Rendered inside the shell, which has already checked workspace and Executive navigation.
async function CouncilMembers() {
  const members = await listCouncilMembers().catch(() => null);
  if (!members) return <p role="alert" className="rounded-lg bg-error-surface p-3 text-sm">We couldn’t load Council members. Please try again.</p>;
  return <CouncilMembersTable members={members} />;
}
