import { WorkspaceShell } from "@/components/layout/workspace-shell";
import type { SemesterListItem } from "@/features/semesters/contracts";
import { CreateSemesterDialog } from "@/features/semesters/components/create-semester-dialog";
import { SemesterList } from "@/features/semesters/components/semester-list";
import { getSemesters } from "@/features/semesters/queries";
import { getAccessContext } from "@/server/auth/access-context";

export const instant = false;

export default async function CouncilSemestersPage({
  searchParams,
}: {
  searchParams: Promise<{ semester?: string | string[] }>;
}) {
  const { semester } = await searchParams;
  const access = await getAccessContext();
  const canManage =
    access.status === "ready" &&
    (access.councilRole === "executive" || access.councilRole === "operations");

  let semesters: SemesterListItem[] = [];
  try {
    semesters = await getSemesters();
  } catch {
    semesters = [];
  }

  return (
    <WorkspaceShell workspace="council" destination="semesters" semester={semester}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="font-heading text-lg font-medium text-foreground">
              Semester Management
            </h2>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Create academic semesters and explicitly activate the current academic context.
            </p>
          </div>
          {canManage && <CreateSemesterDialog />}
        </div>

        <SemesterList semesters={semesters} canManage={canManage} />
      </div>
    </WorkspaceShell>
  );
}
