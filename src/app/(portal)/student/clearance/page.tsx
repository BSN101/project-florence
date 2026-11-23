import { connection } from "next/server";

import { RefreshButton } from "@/components/layout/refresh-button";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { StudentClearanceView } from "@/features/clearance/components/student-clearance-view";
import { getStudentClearanceSummary } from "@/features/clearance/queries";
import { semesterFilterSchema } from "@/features/semesters/schemas";
import { getAccessContext } from "@/server/auth/access-context";

export const instant = false;

export default async function StudentClearancePage({
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
        destination="clearance"
        semester={semester}
      />
    );
  }

  // Same selection as WorkspaceShell: only semesters the student is enrolled in.
  const enrolled = access.semesters.filter((s) =>
    access.enrollments.some((e) => e.semester_id === s.id)
  );
  const filter = semesterFilterSchema.safeParse({ semester });
  const semesterId = !filter.success
    ? undefined
    : filter.data.semester
    ? enrolled.find((s) => s.id === filter.data.semester)?.id
    : enrolled.find((s) => s.is_current)?.id ?? enrolled[0]?.id;

  let summary = null;
  let errorNotice: string | null = null;

  if (semesterId) {
    try {
      summary = await getStudentClearanceSummary(semesterId);
    } catch {
      errorNotice = "Unable to load clearance records at this time. Please refresh the page.";
    }
  }

  return (
    <WorkspaceShell
      workspace="student"
      destination="clearance"
      semester={semester}
    >
      {errorNotice ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-5 text-sm text-destructive shadow-xs">
          <div className="font-medium">Unable to load clearance status</div>
          <p className="mt-1 text-xs">{errorNotice}</p>
        </div>
      ) : summary ? (
        <>
          <div className="-mb-2 flex justify-end">
            <RefreshButton renderedAt={new Date().toISOString()} />
          </div>
          <StudentClearanceView summary={summary} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          You are not enrolled in a semester, so there are no clearance records to show.
        </p>
      )}
    </WorkspaceShell>
  );
}
