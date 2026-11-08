import { WorkspaceShell } from "@/components/layout/workspace-shell";

export const instant = false;

export default async function CouncilReportsPage({ searchParams }: {
  searchParams: Promise<{ semester?: string | string[] }>;
}) {
  const { semester } = await searchParams;
  return <WorkspaceShell workspace="council" destination="reports" semester={semester} />;
}
