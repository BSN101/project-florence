import { connection } from "next/server";
import { AlertCircle } from "lucide-react";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { Card } from "@/components/ui/card";
import { getTodayManila, meritExpiryDate } from "@/features/discipline/calculations";
import { FacultyEndorsementsView } from "@/features/discipline/components/faculty-endorsements-view";
import { getMyAssignedMeritEndorsements } from "@/features/discipline/queries";
import { semesterFilterSchema } from "@/features/semesters/schemas";
import { getAccessContext } from "@/server/auth/access-context";

export const instant = false;

export default async function FacultyMeritEndorsementsPage({
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
        destination="merit-endorsements"
        semester={semester}
      />
    );
  }

  const filter = semesterFilterSchema.safeParse({ semester });
  const selected = !filter.success
    ? undefined
    : filter.data.semester
    ? access.semesters.find((s) => s.id === filter.data.semester)
    : access.semesters.find((s) => s.is_current) ?? access.semesters[0];

  const isCurrentSemester = Boolean(selected?.is_current);
  const semesterLabel = selected
    ? `${selected.term} (AY ${selected.academic_year_start}–${selected.academic_year_start + 1})`
    : "";
  const todayManila = getTodayManila();
  const expiresOnManila = meritExpiryDate(todayManila);
  const renderedAt = new Date().toISOString();

  let content: React.ReactNode = null;
  if (selected) {
    const endorsements = await getMyAssignedMeritEndorsements(selected.id).catch(() => null);
    content = !endorsements ? (
      <Card role="alert" className="flex flex-col items-center justify-center gap-3 p-8 text-center">
        <AlertCircle className="size-8 text-destructive" />
        <p className="text-sm text-muted-foreground">
          Unable to load assigned merit endorsements. Refresh the page to try again.
        </p>
      </Card>
    ) : (
      <FacultyEndorsementsView
        endorsements={endorsements}
        semesterLabel={semesterLabel}
        isCurrentSemester={isCurrentSemester}
        todayManila={todayManila}
        expiresOnManila={expiresOnManila}
        renderedAt={renderedAt}
      />
    );
  }

  return (
    <WorkspaceShell workspace="faculty" destination="merit-endorsements" semester={semester}>
      {content}
    </WorkspaceShell>
  );
}
