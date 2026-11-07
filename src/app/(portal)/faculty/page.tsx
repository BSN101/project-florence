import { WorkspaceShell } from "@/components/layout/workspace-shell";

export const instant = false;

export default function FacultyPage() {
  return <WorkspaceShell workspace="faculty">
    <p className="text-muted-foreground">Instructor and matching coordinator assignments share this workspace. Faculty records and actions are not implemented yet.</p>
  </WorkspaceShell>;
}
