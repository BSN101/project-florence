import { connection } from "next/server";

import { RefreshButton } from "@/components/layout/refresh-button";
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
    return <WorkspaceShell workspace="council" destination="clearance" semester={semester} />;
  }

  const filter = semesterFilterSchema.safeParse({ semester });
  const semesterId = !filter.success
    ? undefined
    : filter.data.semester
    ? access.semesters.find((item) => item.id === filter.data.semester)?.id
    : access.semesters.find((item) => item.is_current)?.id ?? access.semesters[0]?.id;

  // Skip the read for other roles; WorkspaceShell then 404s them (Clearance is not in their navigation).
  const candidates = semesterId && isAuthorizedCouncilClearanceRole(access.councilRole)
    ? await getCouncilClearanceCandidates(semesterId)
    : null;

  return (
    <WorkspaceShell workspace="council" destination="clearance" semester={semester}>
      {semesterId && candidates && (
        <>
          {/* Other officers confirm clearances too; revisits may reuse a render up to 30 s old. */}
          <div className="-mb-2 flex justify-end"><RefreshButton renderedAt={new Date().toISOString()} /></div>
          <CouncilClearanceView candidates={candidates} semesterId={semesterId} />
        </>
      )}
    </WorkspaceShell>
  );
}
