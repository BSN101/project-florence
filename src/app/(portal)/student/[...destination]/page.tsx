import { WorkspaceShell } from "@/components/layout/workspace-shell";

export const instant = false;

export default async function StudentDestinationPage({ params, searchParams }: {
  params: Promise<{ destination: string[] }>;
  searchParams: Promise<{ semester?: string | string[] }>;
}) {
  const [{ destination }, { semester }] = await Promise.all([params, searchParams]);
  const slug = destination.join("/");
  return <WorkspaceShell workspace="student" destination={slug} semester={semester} />;
}
