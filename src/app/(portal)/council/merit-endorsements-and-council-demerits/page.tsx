import { connection } from "next/server";
import { notFound } from "next/navigation";
import { AlertCircle } from "lucide-react";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { Card } from "@/components/ui/card";
import { CouncilDisciplinaryView } from "@/features/discipline/components/council-disciplinary-view";
import { getCouncilDisciplinaryRecords } from "@/features/discipline/queries";
import { semesterFilterSchema } from "@/features/semesters/schemas";
import { getAccessContext } from "@/server/auth/access-context";

export const instant = false;

export default async function CouncilMeritEndorsementsAndDemeritsPage({
  searchParams,
}: {
  searchParams: Promise<{ semester?: string | string[] }>;
}) {
  await connection();
  const { semester } = await searchParams;
  const access = await getAccessContext();

  if (access.status !== "ready" || !access.workspaces.includes("council")) {
    return (
      <WorkspaceShell
        workspace="council"
        destination="merit-endorsements-and-council-demerits"
        semester={semester}
      />
    );
  }

  // FL-029 & Navigation Map: Only Council Executive and Operations manage/view endorsements and demerits.
  // Representatives have events-only access and are strictly denied.
  const canManage =
    access.councilRole === "executive" || access.councilRole === "operations";
  if (!canManage) {
    notFound();
  }

  const filter = semesterFilterSchema.safeParse({ semester });
  const semesterId = !filter.success
    ? undefined
    : filter.data.semester
    ? access.semesters.find((item) => item.id === filter.data.semester)?.id
    : access.semesters.find((item) => item.is_current)?.id ?? access.semesters[0]?.id;

  let content: React.ReactNode = null;
  if (semesterId) {
    try {
      const data = await getCouncilDisciplinaryRecords(semesterId);
      content = <CouncilDisciplinaryView data={data} />;
    } catch {
      content = (
        <Card role="alert" className="flex flex-col items-center justify-center gap-3 p-8 text-center">
          <AlertCircle className="size-8 text-destructive" />
          <p className="text-xs text-muted-foreground">
            Unable to load Council disciplinary records. Refresh the page to try again.
          </p>
        </Card>
      );
    }
  } else {
    content = (
      <p className="text-xs text-muted-foreground">
        Select a valid semester to view Council-generated demerits and merit endorsements.
      </p>
    );
  }

  return (
    <WorkspaceShell
      workspace="council"
      destination="merit-endorsements-and-council-demerits"
      semester={semester}
    >
      {content}
    </WorkspaceShell>
  );
}
