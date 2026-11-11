import Link from "next/link";
import { CalendarX, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { AddStudentDialog } from "@/features/students/components/add-student-dialog";
import { DownloadTemplateButton } from "@/features/students/components/download-template-button";
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

  const canManage =
    access.status === "ready" &&
    (access.councilRole === "executive" || access.councilRole === "operations");

  // Determine active/selected semester
  const selectedSemesterId =
    typeof semester === "string"
      ? semester
      : access.status === "ready"
        ? access.currentSemester?.id ?? access.semesters[0]?.id
        : undefined;

  const currentSemester =
    access.status === "ready"
      ? access.semesters.find((s) => s.id === selectedSemesterId) ?? access.currentSemester
      : null;

  let students: StudentRosterItem[] = [];
  if (selectedSemesterId) {
    try {
      students = await getRoster(selectedSemesterId);
    } catch {
      students = [];
    }
  }

  return (
    <WorkspaceShell workspace="council" destination="" semester={semester}>
      <div className="flex flex-col gap-6">
        {!selectedSemesterId ? (
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
              <Button render={<Link href="/council/semesters" />} className="gap-2 font-medium">
                <Settings className="size-4" />
                Manage Semesters
              </Button>
            )}
          </Card>
        ) : (
          <>
            {/* Header and Action Controls */}
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 flex-1 space-y-1">
                <h2 className="font-heading text-lg font-medium text-foreground">
                  Student Roster
                </h2>
                <p className="text-xs text-muted-foreground">
                  Manage individual student enrollment and demographic identities for{" "}
                  {currentSemester ? (
                    <strong className="font-medium text-foreground">
                      {currentSemester.term} (AY {currentSemester.academic_year_start}–
                      {currentSemester.academic_year_start + 1})
                    </strong>
                  ) : (
                    "the selected semester"
                  )}
                  .
                </p>
              </div>

              <div className="flex w-full flex-col gap-2 shrink-0 md:w-56 lg:w-60 xl:w-auto xl:flex-row xl:items-center">
                <DownloadTemplateButton className="w-full justify-center xl:w-auto" />
                {canManage && (
                  <AddStudentDialog
                    activeSemesterId={selectedSemesterId}
                    className="w-full justify-center xl:w-auto"
                  />
                )}
              </div>
            </div>
            {/* Roster Table */}
            <RosterTable
              students={students}
              activeSemesterId={selectedSemesterId}
              canManage={canManage}
            />
          </>
        )}
      </div>
    </WorkspaceShell>
  );
}
