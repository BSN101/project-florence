import { WorkspaceShell } from "@/components/layout/workspace-shell";

export const instant = false;

export default function CouncilPage() {
  return <WorkspaceShell workspace="council">
    <p className="text-muted-foreground">Council access is based on your active membership. Representatives will have Events-only access when event pages are implemented. Council actions are not implemented yet.</p>
  </WorkspaceShell>;
}
