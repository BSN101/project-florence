import { connection } from "next/server";
import { AlertCircle } from "lucide-react";

import { preloadWorkspaceShell, WorkspaceShell } from "@/components/layout/workspace-shell";
import { Card } from "@/components/ui/card";
import { StudentDisciplinaryView } from "@/features/discipline/components/student-disciplinary-view";
import { getMyDisciplinaryRecords } from "@/features/discipline/queries";
import { semesterFilterSchema } from "@/features/semesters/schemas";
import { getAccessContext } from "@/server/auth/access-context";

export const instant = false;

export default async function StudentMeritsDemeritsAndServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ semester?: string | string[] }>;
}) {
  await connection();
  const { semester } = await searchParams;
  const access = await getAccessContext();

  if (access.status !== "ready" || !access.workspaces.includes("student")) {
    return (
      <WorkspaceShell
        workspace="student"
        destination="merits-demerits-and-services"
        semester={semester}
      />
    );
  }

  const enrolled = access.semesters.filter((s) =>
    access.enrollments.some((e) => e.semester_id === s.id)
  );
  const filter = semesterFilterSchema.safeParse({ semester });
  const semesterId = !filter.success
    ? undefined
    : filter.data.semester
    ? enrolled.find((s) => s.id === filter.data.semester)?.id
    : enrolled.find((s) => s.is_current)?.id ?? enrolled[0]?.id;

  preloadWorkspaceShell("student");

  let data: Awaited<ReturnType<typeof getMyDisciplinaryRecords>> | null = null;
  let loadFailed = false;
  try {
    data = await getMyDisciplinaryRecords(semesterId);
  } catch {
    loadFailed = true;
  }

  const content =
    loadFailed || !data ? (
      <Card role="alert" className="flex flex-col items-center justify-center gap-3 p-8 text-center">
        <AlertCircle className="size-8 text-destructive" />
        <p className="text-xs text-muted-foreground">
          Unable to load disciplinary records and balances. Refresh the page to try again.
        </p>
      </Card>
    ) : (
      <StudentDisciplinaryView
        summary={data.summary}
        demerits={data.demerits}
        merits={data.merits}
        serviceCredits={data.serviceCredits}
      />
    );

  return (
    <WorkspaceShell
      workspace="student"
      destination="merits-demerits-and-services"
      semester={semester}
    >
      {content}
    </WorkspaceShell>
  );
}
