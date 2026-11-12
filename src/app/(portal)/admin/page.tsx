import { WorkspaceShell } from "@/components/layout/workspace-shell";

export const instant = false;

// Users and access has no landing page; the shell redirects to its first sub-page.
export default function AdminPage() {
  return <WorkspaceShell workspace="admin" />;
}
