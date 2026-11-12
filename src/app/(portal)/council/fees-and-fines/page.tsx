import { connection } from "next/server";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { FeeDefinitionList } from "@/features/finance/components/fee-definition-list";
import { FineDefinitionList } from "@/features/finance/components/fine-definition-list";
import { getFeeDefinitions, getFineDefinitions } from "@/features/finance/queries";

export const instant = false;

export default async function CouncilFeesAndFinesPage({
  searchParams,
}: {
  searchParams: Promise<{ semester?: string | string[] }>;
}) {
  await connection();
  const { semester } = await searchParams;
  const [feeDefinitions, fineDefinitions] = await Promise.all([
    getFeeDefinitions({ includeArchived: true }),
    getFineDefinitions({ includeArchived: true }),
  ]);

  return (
    <WorkspaceShell workspace="council" destination="fees-and-fines" semester={semester}>
      <div className="space-y-12">
        <section>
          <FeeDefinitionList definitions={feeDefinitions} />
        </section>
        <section className="border-t border-border pt-8">
          <FineDefinitionList definitions={fineDefinitions} />
        </section>
      </div>
    </WorkspaceShell>
  );
}
