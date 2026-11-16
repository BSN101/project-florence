import { WorkspaceShell } from "@/components/layout/workspace-shell";

export const instant = false;

export default async function CouncilClearancePage({ searchParams }: {
  searchParams: Promise<{ semester?: string | string[] }>;
}) {
  const { semester } = await searchParams;
  return <WorkspaceShell workspace="council" destination="clearance" semester={semester} />;
}
