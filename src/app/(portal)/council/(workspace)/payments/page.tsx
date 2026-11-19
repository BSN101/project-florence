import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { DrillTransition } from "@/components/layout/page-transition";
import { RefreshButton } from "@/components/layout/refresh-button";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CouncilFinancialRosterTable,
  CouncilStudentLedger,
} from "@/features/finance/components/council-financial-ledger-view";
import { PendingTransferReviewSection } from "@/features/finance/components/pending-transfer-review-section";
import {
  canRecordCashForStudent,
  isAuthorizedCouncilFinancialViewer,
} from "@/features/finance/contracts";
import {
  getCouncilFinancialRoster,
  getCouncilStudentFinancialAccount,
  getCouncilStudentPayableObligations,
  getPendingTransferReviews,
} from "@/features/finance/queries";
import { semesterFilterSchema } from "@/features/semesters/schemas";
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

  const filter = semesterFilterSchema.safeParse({ semester });
  const semesterId = !filter.success
    ? undefined
    : filter.data.semester
    ? access.semesters.find((item) => item.id === filter.data.semester)?.id
    : access.semesters.find((item) => item.is_current)?.id ?? access.semesters[0]?.id;

  const studentId = typeof student === "string" ? student : undefined;
  const backHref = `?semester=${semesterId}`;
  const renderedAt = new Date().toISOString();

  // Like events: a selected student shows their ledger, otherwise the semester's student table.
  let content: React.ReactNode = null;
  let errorNotice: string | null = null;
  if (semesterId && studentId) {
    const cashWizardData = canRecordCashForStudent(access.profile.id, studentId)
      ? getCouncilStudentPayableObligations(studentId).catch(() => null)
      : undefined;
    const data = await getCouncilStudentFinancialAccount({ studentId, semesterId }).catch(() => null);
    if (data) {
      content = (
        <CouncilStudentLedger
          data={data}
          backHref={backHref}
          cashWizardData={cashWizardData}
          actorProfileId={access.profile.id}
          currentSemesterId={semesterId}
          renderedAt={renderedAt}
        />
      );
    } else {
      errorNotice =
        "Unable to load the selected student's financial ledger. Please select another student or try again.";
      content = (
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" className="w-fit gap-1" nativeButton={false} render={<Link href={backHref} transitionTypes={["nav-back"]} />}>
            <ArrowLeft className="size-4" /> All students
          </Button>
          <RefreshButton renderedAt={renderedAt} />
        </div>
      );
    }
  } else if (semesterId) {
    // Started now, read later behind Suspense, so the roster is not held back by the review queue.
    const pendingReviews = getPendingTransferReviews(semesterId).catch(() => null);
    const students = await getCouncilFinancialRoster(semesterId).catch(() => null);
    if (students) {
      content = (
        <div className="space-y-8">
          <Suspense fallback={<Skeleton className="h-32 w-full rounded-xl" />}>
            <PendingTransferReviewSection reviews={pendingReviews} actorProfileId={access.profile.id} />
          </Suspense>
          <CouncilFinancialRosterTable students={students} semesterId={semesterId} renderedAt={renderedAt} />
        </div>
      );
    } else {
      errorNotice = "Unable to load the semester's student accounts at this time. Please refresh the page.";
      content = (
        <div className="flex justify-end">
          <RefreshButton renderedAt={renderedAt} />
        </div>
      );
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
      {semesterId ? (
        <DrillTransition id={studentId ?? "list"}>{content}</DrillTransition>
      ) : (
        <p className="text-sm text-muted-foreground">
          No semester is available. Select a semester to view student financial accounts.
        </p>
      )}
    </WorkspaceShell>
  );
}
