import { connection } from "next/server";

import { preloadWorkspaceShell, WorkspaceShell } from "@/components/layout/workspace-shell";
import { StudentFeesAndFinesView } from "@/features/finance/components/student-fees-and-fines-view";
import { getStudentFinancialAccount } from "@/features/finance/queries";
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

  preloadWorkspaceShell("student");

  const resolvedSemesterParam =
    typeof semester === "string" ? semester : undefined;
  let financialData = null;
  let errorNotice: string | null = null;

  try {
    financialData = await getStudentFinancialAccount({
      semesterId: resolvedSemesterParam,
    });
  } catch (err) {
    errorNotice =
      err instanceof Error
        ? err.message
        : "Failed to load financial records. Please refresh.";
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
      ) : null}
    </WorkspaceShell>
  );
}
