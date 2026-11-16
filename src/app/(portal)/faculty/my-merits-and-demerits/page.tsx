import { connection } from "next/server";
import { AlertCircle, CalendarX, Info } from "lucide-react";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { Card } from "@/components/ui/card";
import { getTodayManila } from "@/features/discipline/calculations";
import { AwardMeritsDialog } from "@/features/discipline/components/award-merits-dialog";
import { FacultyMyDisciplineView } from "@/features/discipline/components/faculty-my-discipline-view";
import type { FacultyMeritGroup } from "@/features/discipline/contracts";
import { getMyFacultyMerits } from "@/features/discipline/queries";
import { semesterFilterSchema } from "@/features/semesters/schemas";
import type { StudentRosterItem } from "@/features/students/contracts";
import { getRoster } from "@/features/students/queries";
import { getAccessContext } from "@/server/auth/access-context";

export const instant = false;

export default async function FacultyMeritsAndDemeritsPage({
  searchParams,
}: {
  searchParams: Promise<{ semester?: string | string[] }>;
}) {
  await connection();
  const { semester } = await searchParams;
  const access = await getAccessContext();

  if (access.status !== "ready" || !access.workspaces.includes("faculty")) {
    return (
      <WorkspaceShell
        workspace="faculty"
        destination="my-merits-and-demerits"
        semester={semester}
      />
    );
  }

  const filter = semesterFilterSchema.safeParse({ semester });
  const selectedSemester = !filter.success
    ? undefined
    : filter.data.semester
    ? access.semesters.find((s) => s.id === filter.data.semester)
    : access.currentSemester ?? access.semesters[0];

  const isActiveSemester = Boolean(selectedSemester && selectedSemester.is_current);
  const todayManila = getTodayManila();

  let merits: FacultyMeritGroup[] = [];
  let students: StudentRosterItem[] = [];
  let loadFailed = false;

  if (selectedSemester) {
    try {
      const [meritsData, rosterData] = await Promise.all([
        getMyFacultyMerits(selectedSemester.id),
        isActiveSemester ? getRoster(selectedSemester.id, "faculty") : Promise.resolve([]),
      ]);
      merits = meritsData;
      students = rosterData;
    } catch {
      loadFailed = true;
    }
  }

  let content: React.ReactNode = null;

  if (!selectedSemester) {
    content = (
      <Card className="flex flex-col items-center justify-center gap-4 p-8 text-center sm:p-12">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <CalendarX className="size-6 text-muted-foreground" />
        </div>
        <div className="flex flex-col gap-1">
          <h3 className="font-heading text-base font-semibold text-foreground">
            No Active Semester Context
          </h3>
          <p className="max-w-md text-xs text-muted-foreground">
            An active semester must be established before merits and demerits can be managed.
          </p>
        </div>
      </Card>
    );
  } else if (loadFailed) {
    content = (
      <Card role="alert" className="flex flex-col items-center justify-center gap-3 p-8 text-center">
        <AlertCircle className="size-8 text-destructive" />
        <p className="text-xs text-muted-foreground">
          Unable to load disciplinary records. Refresh the page to try again.
        </p>
      </Card>
    );
  } else {
    content = (
      <div className="flex flex-col gap-6">
        {/* Header with Title and Action Trigger */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-heading text-lg font-semibold text-foreground">
              My Merits and Demerits
            </h2>
            <p className="text-xs text-muted-foreground">
              Award whole-day merits to enrolled students and view your issued disciplinary records.
            </p>
          </div>
          <div>
            <AwardMeritsDialog
              students={students}
              semester={selectedSemester}
              isActiveSemester={isActiveSemester}
              actorId={access.profile.id}
              todayManila={todayManila}
            />
          </div>
        </div>

        {/* Historical Semester Notice */}
        {!isActiveSemester && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            <Info className="size-4 shrink-0 text-primary" />
            <span>
              Viewing historical semester: <strong>{selectedSemester.term} (AY {selectedSemester.academic_year_start}–{selectedSemester.academic_year_start + 1})</strong>. Direct merits can
              only be awarded within the currently active semester.
            </span>
          </div>
        )}

        {/* Disciplinary Table View */}
        <FacultyMyDisciplineView merits={merits} />
      </div>
    );
  }

  return (
    <WorkspaceShell
      workspace="faculty"
      destination="my-merits-and-demerits"
      semester={semester}
    >
      {content}
    </WorkspaceShell>
  );
}
