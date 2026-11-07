import { WorkspaceShell } from "@/components/layout/workspace-shell";

export const instant = false;

export default function StudentPage() {
  return <WorkspaceShell workspace="student">
    <p className="text-muted-foreground">Your account and enrollment context are available. Student records and actions are not implemented yet.</p>
  </WorkspaceShell>;
}
