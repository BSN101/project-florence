import { connection } from "next/server";

import { RefreshButton } from "@/components/layout/refresh-button";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { isAuthorizedFacultyClearanceRole } from "@/features/clearance/authorization";
import { FacultyClearanceView } from "@/features/clearance/components/faculty-clearance-view";
import { getFacultyClearanceCandidates } from "@/features/clearance/queries";
import { semesterFilterSchema } from "@/features/semesters/schemas";
import { getAccessContext } from "@/server/auth/access-context";

export const instant = false;

export default async function FacultyRleClearancePage({
  searchParams,
}: {
  searchParams: Promise<{ semester?: string | string[] }>;
}) {
  await connection();
  const { semester } = await searchParams;
  const access = await getAccessContext();

  if (access.status !== "ready" || !access.workspaces.includes("faculty")) {
    return <WorkspaceShell workspace="faculty" destination="rle-clearance" semester={semester} />;
  }

  const filter = semesterFilterSchema.safeParse({ semester });
  const selectedSemester = !filter.success
    ? undefined
    : filter.data.semester
    ? access.semesters.find((item) => item.id === filter.data.semester)
    : access.currentSemester ?? access.semesters[0];

  const semesterId = selectedSemester?.id;
  const isCurrentSemester = Boolean(selectedSemester?.is_current);

  // Skip the read for other roles; WorkspaceShell then 404s them (RLE Clearance is not in their navigation).
  const isAuthorized = isAuthorizedFacultyClearanceRole(access.roles, "rle");
  const candidates = semesterId && isAuthorized
    ? await getFacultyClearanceCandidates(semesterId, "rle", "rle")
    : null;

  return (
    <WorkspaceShell workspace="faculty" destination="rle-clearance" semester={semester}>
      {semesterId && candidates && (
        <>
          <div className="-mb-2 flex justify-end">
            <RefreshButton renderedAt={new Date().toISOString()} />
          </div>
          <FacultyClearanceView
            candidates={candidates}
            semesterId={semesterId}
            component="rle"
            isCurrentSemester={isCurrentSemester}
          />
        </>
      )}
    </WorkspaceShell>
  );
}
