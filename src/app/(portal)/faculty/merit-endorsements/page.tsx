import { connection } from "next/server";
import { AlertCircle } from "lucide-react";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { Card } from "@/components/ui/card";
import { countPendingBySemester } from "@/features/discipline/calculations";
import { FacultyEndorsementsView } from "@/features/discipline/components/faculty-endorsements-view";
import {
  getMyAssignedMeritEndorsements,
  getMyPendingEndorsementsElsewhere,
} from "@/features/discipline/queries";
import { resolveSelectedSemester } from "@/features/semesters/schemas";
import { getAccessContext } from "@/server/auth/access-context";

export const instant = false;

function semesterLabelOf(s: { term: string; academic_year_start: number }) {
  return `${s.term} (AY ${s.academic_year_start}–${s.academic_year_start + 1})`;
}

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

  const selected = resolveSelectedSemester(access.semesters, semester);
  const renderedAt = new Date().toISOString();

  let content: React.ReactNode = null;
  if (selected) {
    // Secondary read: started now, streamed into the callout behind <Suspense>.
    const pendingElsewhere = getMyPendingEndorsementsElsewhere(selected.id)
      .then((rows) =>
        countPendingBySemester(rows, access.semesters).map(({ semester: s, count }) => ({
          id: s.id,
          label: semesterLabelOf(s),
          count,
        }))
      )
      .catch((error) => {
        console.error("Pending endorsements in other semesters failed to load", error);
        return [];
      });
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
        semesterLabel={semesterLabelOf(selected)}
        isCurrentSemester={selected.is_current}
        pendingElsewhere={pendingElsewhere}
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
