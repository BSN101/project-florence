import { WorkspaceShell } from "@/components/layout/workspace-shell";

export const instant = false;

export default async function StudentClearancePage({ searchParams }: {
  searchParams: Promise<{ semester?: string | string[] }>;
}) {
  const { semester } = await searchParams;
  return <WorkspaceShell workspace="student" destination="clearance" semester={semester} />;
}
