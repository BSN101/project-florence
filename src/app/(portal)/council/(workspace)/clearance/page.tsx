import { connection } from "next/server";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { isAuthorizedCouncilClearanceRole } from "@/features/clearance/authorization";
import { CouncilClearanceView } from "@/features/clearance/components/council-clearance-view";
import { getCouncilClearanceCandidates } from "@/features/clearance/queries";
import { semesterFilterSchema } from "@/features/semesters/schemas";
import { getAccessContext } from "@/server/auth/access-context";

export const instant = false;

export default async function CouncilClearancePage({
  searchParams,
}: {
  searchParams: Promise<{ semester?: string | string[] }>;
}) {
  await connection();
  const { semester } = await searchParams;
  const access = await getAccessContext();

  if (access.status !== "ready" || !access.workspaces.includes("council")) {
    return (
      <WorkspaceShell workspace="council" destination="clearance" semester={semester} />
    );
  }

  const isAuthorized = isAuthorizedCouncilClearanceRole(access.councilRole);

  const filter = semesterFilterSchema.safeParse({ semester });
  const semesterId = !filter.success
    ? undefined
    : filter.data.semester
    ? access.semesters.find((item) => item.id === filter.data.semester)?.id
    : access.semesters.find((item) => item.is_current)?.id ?? access.semesters[0]?.id;

  const candidates =
    isAuthorized && semesterId ? await getCouncilClearanceCandidates(semesterId) : [];

  return (
    <WorkspaceShell workspace="council" destination="clearance" semester={semester}>
      {isAuthorized && semesterId ? (
        <CouncilClearanceView candidates={candidates} semesterId={semesterId} />
      ) : (
        <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {!isAuthorized
            ? "Only Council Executive and Council Operations officers may access Council clearance."
            : "No active semester selected."}
        </div>
      )}
    </WorkspaceShell>
  );
}
