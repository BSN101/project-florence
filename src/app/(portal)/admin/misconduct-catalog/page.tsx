import { WorkspaceShell } from "@/components/layout/workspace-shell";

export const instant = false;

export default async function AdminMisconductCatalogPage({ searchParams }: {
  searchParams: Promise<{ semester?: string | string[] }>;
}) {
  const { semester } = await searchParams;
  return <WorkspaceShell workspace="admin" destination="misconduct-catalog" semester={semester} />;
}
