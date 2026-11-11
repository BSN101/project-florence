import { connection } from "next/server";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { FineDefinitionList } from "@/features/finance/components/fine-definition-list";
import { getFineDefinitions } from "@/features/finance/queries";

export const instant = false;

export default async function CouncilFeesAndFinesPage({
  searchParams,
}: {
  searchParams: Promise<{ semester?: string | string[] }>;
}) {
  await connection();
  const { semester } = await searchParams;
  const fineDefinitions = await getFineDefinitions({ includeArchived: true });

  return (
    <WorkspaceShell workspace="council" destination="fees-and-fines" semester={semester}>
      <FineDefinitionList definitions={fineDefinitions} />
    </WorkspaceShell>
  );
}
