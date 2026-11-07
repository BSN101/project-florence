import { WorkspaceShell } from "@/components/layout/workspace-shell";

export const instant = false;

export default function AdminPage() {
  return <WorkspaceShell workspace="admin">
    <p className="text-muted-foreground">Platform administration access does not grant Council or Faculty authority. Account management and catalog tools are not implemented yet.</p>
  </WorkspaceShell>;
}
