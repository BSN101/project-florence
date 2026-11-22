import { connection } from "next/server";

import { RefreshButton } from "@/components/layout/refresh-button";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { isAuthorizedFacultyClearanceRole } from "@/features/clearance/authorization";
import { FacultyClearanceView } from "@/features/clearance/components/faculty-clearance-view";
import { getFacultyClearanceCandidates } from "@/features/clearance/queries";
import { semesterFilterSchema } from "@/features/semesters/schemas";
import { getAccessContext } from "@/server/auth/access-context";
import {
  FACULTY_CLEARANCE_CONFIG,
  type FacultyClearanceComponent,
} from "../contracts";

export async function FacultyClearancePageContent({
  component,
  searchParams,
}: {
  component: FacultyClearanceComponent;
  searchParams: Promise<{ semester?: string | string[] }>;
}) {
  await connection();
  const { semester } = await searchParams;
  const access = await getAccessContext();
  const config = FACULTY_CLEARANCE_CONFIG[component];

  const ready = access.status === "ready" && access.workspaces.includes("faculty") ? access : null;

  const filter = semesterFilterSchema.safeParse({ semester });
  const selectedSemester = !ready || !filter.success
    ? undefined
    : filter.data.semester
    ? ready.semesters.find((item) => item.id === filter.data.semester)
    : ready.currentSemester ?? ready.semesters[0];

  const semesterId = selectedSemester?.id;

  const isAuthorized = ready ? isAuthorizedFacultyClearanceRole(ready.roles, component) : false;
  const candidates =
    semesterId && isAuthorized
      ? await getFacultyClearanceCandidates(semesterId, component)
      : null;

  return (
    <WorkspaceShell workspace="faculty" destination={config.destination} semester={semester}>
      {semesterId && candidates && (
        <>
          <div className="-mb-2 flex justify-end">
            <RefreshButton renderedAt={new Date().toISOString()} />
          </div>
          <FacultyClearanceView
            candidates={candidates}
            semesterId={semesterId}
            component={component}
          />
        </>
      )}
    </WorkspaceShell>
  );
}
