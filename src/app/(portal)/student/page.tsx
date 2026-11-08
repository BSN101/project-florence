import { WorkspaceShell } from "@/components/layout/workspace-shell";

export const instant = false;

export default async function StudentPage({ searchParams }: { searchParams: Promise<{ semester?: string | string[] }> }) {
  const { semester } = await searchParams;
  return <WorkspaceShell workspace="student" semester={semester}>
    <p className="text-muted-foreground">This is the Home and attendance QR page.</p>
  </WorkspaceShell>;
}
