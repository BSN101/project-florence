import { AlertCircle, CalendarX } from "lucide-react";

import { Card } from "@/components/ui/card";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { RosterTable } from "@/features/students/components/roster-table";
import type { StudentRosterItem } from "@/features/students/contracts";
import { getRoster } from "@/features/students/queries";
import { getAccessContext } from "@/server/auth/access-context";

export const instant = false;

export default async function FacultyPage({
  searchParams,
}: {
  searchParams: Promise<{ semester?: string | string[] }>;
}) {
  const { semester } = await searchParams;
  const access = await getAccessContext();
  const ready = access.status === "ready" ? access : null;

  // Selected semester matching WorkspaceShell's semester filter logic
  const selected = ready
    ? ready.semesters.find((s) => s.id === semester) ?? ready.currentSemester ?? ready.semesters[0]
    : undefined;

  let students: StudentRosterItem[] = [];
  let loadFailed = false;

  if (ready && selected) {
    try {
      students = await getRoster(selected.id, "faculty");
    } catch {
      loadFailed = true;
    }
  }

  return (
    <WorkspaceShell workspace="faculty" destination="" semester={semester}>
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
                An active semester must be established before the student directory can be viewed.
              </p>
            </div>
          </Card>
        ) : (
          <>
            {/* Header */}
            <div className="flex flex-col gap-1">
              <h2 className="font-heading text-lg font-medium text-foreground">
                Student Directory
              </h2>
              <p className="text-xs text-muted-foreground">
                Viewing enrolled student profiles and enrollment records for{" "}
                <strong className="font-medium text-foreground">
                  {selected.term} (AY {selected.academic_year_start}–{selected.academic_year_start + 1})
                </strong>
                .
              </p>
            </div>

            {/* Error or Roster Table */}
            {loadFailed ? (
              <Card role="alert" className="flex flex-col items-center justify-center gap-3 p-8 text-center">
                <AlertCircle className="size-8 text-destructive" />
                <p className="text-xs text-muted-foreground">
                  The student directory couldn&rsquo;t be loaded. Refresh the page to try again.
                </p>
              </Card>
            ) : (
              <RosterTable students={students} canEdit={false} />
            )}
          </>
        )}
      </div>
    </WorkspaceShell>
  );
}
