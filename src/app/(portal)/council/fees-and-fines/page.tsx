import { connection } from "next/server";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { FeeDefinitionList } from "@/features/finance/components/fee-definition-list";
import { FeePublicationList } from "@/features/finance/components/fee-publication-list";
import { FineDefinitionList } from "@/features/finance/components/fine-definition-list";
import {
  getFeeDefinitions,
  getFeePublications,
  getFineDefinitions,
} from "@/features/finance/queries";
import { semesterFilterSchema } from "@/features/semesters/schemas";
import { getAccessContext } from "@/server/auth/access-context";

export const instant = false;

export default async function CouncilFeesAndFinesPage({
  searchParams,
}: {
  searchParams: Promise<{ semester?: string | string[] }>;
}) {
  await connection();
  const { semester } = await searchParams;
  const access = await getAccessContext();
  if (access.status !== "ready" || !access.workspaces.includes("council")) {
    return (
      <WorkspaceShell workspace="council" destination="fees-and-fines" semester={semester} />
    );
  }

  const filter = semesterFilterSchema.safeParse({ semester });
  const semesterId = !filter.success
    ? undefined
    : filter.data.semester
    ? access.semesters.find((item) => item.id === filter.data.semester)?.id
    : access.semesters.find((item) => item.is_current)?.id ?? access.semesters[0]?.id;

  const canManage =
    access.councilRole === "executive" || access.councilRole === "operations";

  const [feeDefinitions, fineDefinitions, publications] = await Promise.all([
    getFeeDefinitions({ includeArchived: true }),
    getFineDefinitions({ includeArchived: true }),
    canManage && semesterId ? getFeePublications(semesterId) : Promise.resolve([]),
  ]);

  return (
    <WorkspaceShell workspace="council" destination="fees-and-fines" semester={semester}>
      <div className="space-y-12">
        <section>
          <FeeDefinitionList
            definitions={feeDefinitions}
            canManage={canManage}
            semesterId={semesterId}
          />
        </section>
        {canManage && (
          <section className="border-t border-border pt-8">
            <FeePublicationList publications={publications} />
          </section>
        )}
        <section className="border-t border-border pt-8">
          <FineDefinitionList definitions={fineDefinitions} canManage={canManage} />
        </section>
      </div>
    </WorkspaceShell>
  );
}
