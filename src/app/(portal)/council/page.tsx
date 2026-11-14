import Link from "next/link";
import { AlertCircle, CalendarX, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { AddStudentDialog } from "@/features/students/components/add-student-dialog";
import { BulkInviteDialog } from "@/features/students/components/bulk-invite-dialog";
import { RosterCsvMenu } from "@/features/students/components/roster-csv-menu";
import { RosterTable } from "@/features/students/components/roster-table";
import type { StudentRosterItem } from "@/features/students/contracts";
import { getRoster } from "@/features/students/queries";
import { getAccessContext } from "@/server/auth/access-context";

export const instant = false;

export default async function CouncilPage({
  searchParams,
}: {
  searchParams: Promise<{ semester?: string | string[] }>;
}) {
  const { semester } = await searchParams;
  const access = await getAccessContext();
  const ready = access.status === "ready" ? access : null;
  // Representatives never reach this content: WorkspaceShell redirects them off Students.
  const canManage = ready?.councilRole === "executive" || ready?.councilRole === "operations";

  // Same selection as WorkspaceShell's semester filter.
  const selected = ready
    ? ready.semesters.find((s) => s.id === semester) ?? ready.currentSemester ?? ready.semesters[0]
    : undefined;
  // Roster changes apply to the current semester only (no backdating).
  const canEdit = canManage && Boolean(selected?.is_current);

  let students: StudentRosterItem[] = [];
  let loadFailed = false;
  if (canManage && selected) {
    try {
      students = await getRoster(selected.id);
    } catch {
      loadFailed = true;
    }
  }

  return (
    <WorkspaceShell workspace="council" semester={semester}>
      <div className="flex flex-col gap-6">
        {!selected ? (
          <Card className="flex flex-col items-center justify-center gap-4 p-8 text-center sm:p-12">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <CalendarX className="size-6 text-muted-foreground" />
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="font-heading text-base font-semibold text-foreground">
                No Active Semester Context
              </h3>
              <p className="max-w-md text-xs text-muted-foreground">
                An active semester must be established before student roster entries and enrollments can be managed.
              </p>
            </div>
            {canManage && (
              <Button nativeButton={false} render={<Link href="/council/semesters" />} className="gap-2 font-medium">
                <Settings className="size-4" />
                Manage Semesters
              </Button>
            )}
          </Card>
        ) : (
          <>
            {/* Header and Action Controls */}
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 flex-1 space-y-1">
                <h2 className="font-heading text-lg font-medium text-foreground">
                  Student Roster
                </h2>
                <p className="text-xs text-muted-foreground">
                  {canEdit ? "Manage individual student enrollment and details for " : "Viewing the roster for "}
                  <strong className="font-medium text-foreground">
                    {selected.term} (AY {selected.academic_year_start}–{selected.academic_year_start + 1})
                  </strong>
                  .
                  {canManage && !canEdit && " Roster changes can only be made in the current semester."}
                </p>
              </div>

              <div className="flex w-full flex-wrap items-center gap-2 sm:gap-2.5 sm:w-auto sm:justify-end shrink-0">
                {canManage && (
                  <RosterCsvMenu
                    canEdit={canEdit}
                    semesterId={selected.id}
                    semesterLabel={`${selected.term} (AY ${selected.academic_year_start}–${selected.academic_year_start + 1})`}
                    students={students}
                  />
                )}
                {canEdit && (
                  <>
                    <BulkInviteDialog semesterId={selected.id} students={students} />
                    <AddStudentDialog />
                  </>
                )}
              </div>
            </div>
            {loadFailed ? (
              <Card role="alert" className="flex flex-col items-center justify-center gap-3 p-8 text-center">
                <AlertCircle className="size-8 text-destructive" />
                <p className="text-xs text-muted-foreground">
                  The roster couldn&rsquo;t be loaded. Refresh the page to try again.
                </p>
              </Card>
            ) : (
              <RosterTable students={students} canEdit={canEdit} />
            )}
          </>
        )}
      </div>
    </WorkspaceShell>
  );
}
