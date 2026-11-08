import { WorkspaceShell } from "@/components/layout/workspace-shell";

export const instant = false;

export default async function CouncilPage({ searchParams }: { searchParams: Promise<{ semester?: string | string[] }> }) {
  const { semester } = await searchParams;
  return <WorkspaceShell workspace="council" semester={semester}>
    <p className="text-muted-foreground">This is the Students page.</p>
  </WorkspaceShell>;
}
