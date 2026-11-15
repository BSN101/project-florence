import { connection } from "next/server";

import { preloadWorkspaceShell, WorkspaceShell } from "@/components/layout/workspace-shell";
import { StudentFeesAndFinesView } from "@/features/finance/components/student-fees-and-fines-view";
import { getStudentFinancialAccount } from "@/features/finance/queries";
import { semesterFilterSchema } from "@/features/semesters/schemas";
import { getAccessContext } from "@/server/auth/access-context";

export const instant = false;

export default async function StudentFeesAndFinesPage({
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
        destination="fees-and-fines"
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

  preloadWorkspaceShell("student");

  let financialData = null;
  let errorNotice: string | null = null;

  if (semesterId) {
    try {
      financialData = await getStudentFinancialAccount({
        semesterId,
      });
    } catch {
      errorNotice =
        "Unable to load your financial records at this time. Please refresh the page.";
    }
  }

  return (
    <WorkspaceShell
      workspace="student"
      destination="fees-and-fines"
      semester={semester}
    >
      {errorNotice ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-5 text-sm text-destructive shadow-xs">
          <div className="font-semibold">Unable to load financial records</div>
          <p className="mt-1 text-xs">{errorNotice}</p>
        </div>
      ) : financialData ? (
        <StudentFeesAndFinesView data={financialData} />
      ) : (
        <p className="text-sm text-muted-foreground">
          You are not enrolled in a semester, so there are no fees or fines to show.
        </p>
      )}
    </WorkspaceShell>
  );
}
