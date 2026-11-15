import { connection } from "next/server";

import { preloadWorkspaceShell, WorkspaceShell } from "@/components/layout/workspace-shell";
import { isAuthorizedCouncilFinancialViewer } from "@/features/finance/contracts";
import { getCouncilStudentFinancialAccount } from "@/features/finance/queries";
import { CouncilFinancialLedgerView } from "@/features/finance/components/council-financial-ledger-view";
import { getAccessContext } from "@/server/auth/access-context";

export const instant = false;

export default async function CouncilPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ semester?: string | string[]; student?: string | string[] }>;
}) {
  await connection();
  const { semester, student } = await searchParams;
  const access = await getAccessContext();

  if (access.status !== "ready" || !access.workspaces.includes("council")) {
    return (
      <WorkspaceShell
        workspace="council"
        destination="payments"
        semester={semester}
      />
    );
  }

  preloadWorkspaceShell("council");

  // Verify Council officer privilege (Executive or Operations required for financial inspection)
  if (!isAuthorizedCouncilFinancialViewer(access.councilRole)) {
    return (
      <WorkspaceShell
        workspace="council"
        destination="payments"
        semester={semester}
      >
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-5 text-sm text-amber-900 dark:text-amber-200">
          <div className="font-semibold">Officer Access Required</div>
          <p className="mt-1 text-xs">
            Only Council Executive and Operations officers are permitted to view student financial accounts and payment ledgers.
          </p>
        </div>
      </WorkspaceShell>
    );
  }

  const resolvedSemesterParam = typeof semester === "string" ? semester : undefined;
  const resolvedStudentParam = typeof student === "string" ? student : undefined;

  let initialStudentData = null;
  let errorNotice: string | null = null;

  if (resolvedStudentParam) {
    try {
      initialStudentData = await getCouncilStudentFinancialAccount({
        studentId: resolvedStudentParam,
        semesterId: resolvedSemesterParam,
      });
    } catch (err) {
      errorNotice =
        err instanceof Error
          ? err.message
          : "Failed to load student financial ledger. Please select another student or retry.";
    }
  }

  return (
    <WorkspaceShell
      workspace="council"
      destination="payments"
      semester={semester}
    >
      {errorNotice && (
        <div className="mb-6 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          <div className="font-semibold">Unable to load student ledger</div>
          <p className="mt-1 text-xs">{errorNotice}</p>
        </div>
      )}
      <CouncilFinancialLedgerView
        initialStudentData={initialStudentData}
        currentSemesterId={resolvedSemesterParam}
      />
    </WorkspaceShell>
  );
}
