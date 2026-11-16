import Link from "next/link";
import { connection } from "next/server";
import { AlertCircle, Info, Plus } from "lucide-react";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getTodayManila } from "@/features/discipline/calculations";
import { AwardMeritsFlow } from "@/features/discipline/components/award-merits-flow";
import { FacultyMyDisciplineView } from "@/features/discipline/components/faculty-my-discipline-view";
import type { AwardRecipientOption } from "@/features/discipline/contracts";
import { getMyFacultyMerits } from "@/features/discipline/queries";
import { semesterFilterSchema } from "@/features/semesters/schemas";
import { getRoster } from "@/features/students/queries";
import { getAccessContext } from "@/server/auth/access-context";

export const instant = false;

const path = "/faculty/my-merits-and-demerits";

export default async function FacultyMeritsAndDemeritsPage({
  searchParams,
}: {
  searchParams: Promise<{ semester?: string | string[]; award?: string | string[]; student?: string | string[] }>;
}) {
  await connection();
  const { semester, award, student } = await searchParams;
  const access = await getAccessContext();

  if (access.status !== "ready" || !access.workspaces.includes("faculty")) {
    return <WorkspaceShell workspace="faculty" destination="my-merits-and-demerits" semester={semester} />;
  }

  const filter = semesterFilterSchema.safeParse({ semester });
  const selected = !filter.success
    ? undefined
    : filter.data.semester
    ? access.semesters.find((s) => s.id === filter.data.semester)
    : access.semesters.find((s) => s.is_current) ?? access.semesters[0];
  const canAward = Boolean(selected?.is_current);
  const semesterLabel = selected ? `${selected.term} (AY ${selected.academic_year_start}–${selected.academic_year_start + 1})` : "";
  // The list keeps an explicit semester; awards always go to the current one, so the award link drops it.
  const listHref = filter.success && filter.data.semester ? `${path}?semester=${filter.data.semester}` : path;

  let content: React.ReactNode = null;
  const loadError = (
    <Card role="alert" className="flex flex-col items-center justify-center gap-3 p-8 text-center">
      <AlertCircle className="size-8 text-destructive" />
      <p className="text-sm text-muted-foreground">Unable to load your entries. Refresh the page to try again.</p>
    </Card>
  );

  // WorkspaceShell 404s unknown semesters and explains when none exist.
  if (selected && award !== undefined && canAward) {
    const roster = await getRoster(selected.id, "faculty").catch(() => null);
    if (!roster) {
      content = loadError;
    } else {
      const students: AwardRecipientOption[] = roster
        .filter((s) => s.student_id !== access.profile.id)
        .map(({ student_id, university_id, first_name, middle_name, last_name, suffix, year_level }) =>
          ({ student_id, university_id, first_name, middle_name, last_name, suffix, year_level }));
      const today = getTodayManila();
      content = (
        <AwardMeritsFlow
          students={students}
          semesterLabel={semesterLabel}
          startsOn={selected.starts_on}
          latestDate={selected.ends_on < today ? selected.ends_on : today}
          initialStudentId={students.some((s) => s.student_id === student) ? (student as string) : undefined}
          listHref={listHref}
        />
      );
    }
  } else if (selected) {
    const merits = await getMyFacultyMerits(selected.id).catch(() => null);
    content = !merits ? loadError : (
      <div className="flex flex-col gap-4">
        <div className="flex sm:justify-end">
          {canAward ? (
            <Button nativeButton={false} render={<Link href={`${path}?award`} />} className="gap-2 max-sm:w-full">
              <Plus className="size-4" /> Award merits
            </Button>
          ) : (
            <Button disabled className="gap-2 max-sm:w-full"><Plus className="size-4" /> Award merits</Button>
          )}
        </div>
        {!canAward && (
          <p className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            <Info className="size-4 shrink-0 text-primary" />
            <span>You are viewing {semesterLabel}. Merits can only be awarded in the current semester.</span>
          </p>
        )}
        <FacultyMyDisciplineView merits={merits} />
      </div>
    );
  }

  return (
    <WorkspaceShell workspace="faculty" destination="my-merits-and-demerits" semester={semester}>
      {content}
    </WorkspaceShell>
  );
}
