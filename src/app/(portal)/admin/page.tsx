import { WorkspaceShell } from "@/components/layout/workspace-shell";

export const instant = false;

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ semester?: string | string[] }> }) {
  const { semester } = await searchParams;
  return <WorkspaceShell workspace="admin" semester={semester}>
    <p className="text-muted-foreground">This is the Users and access page.</p>
  </WorkspaceShell>;
}
