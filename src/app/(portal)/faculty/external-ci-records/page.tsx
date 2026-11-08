import { WorkspaceShell } from "@/components/layout/workspace-shell";

export const instant = false;

export default async function FacultyExternalCiRecordsPage({ searchParams }: {
  searchParams: Promise<{ semester?: string | string[] }>;
}) {
  const { semester } = await searchParams;
  return <WorkspaceShell workspace="faculty" destination="external-ci-records" semester={semester} />;
}
