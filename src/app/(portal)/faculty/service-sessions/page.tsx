import { WorkspaceShell } from "@/components/layout/workspace-shell";

export const instant = false;

export default async function FacultyServiceSessionsPage({ searchParams }: {
  searchParams: Promise<{ semester?: string | string[] }>;
}) {
  const { semester } = await searchParams;
  return <WorkspaceShell workspace="faculty" destination="service-sessions" semester={semester} />;
}
