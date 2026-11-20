import { connection } from "next/server";
import { redirect } from "next/navigation";
import { AlertCircle } from "lucide-react";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { Card } from "@/components/ui/card";
import {
  ApplyMeritsFlow,
  MeritApplicationResultCard,
} from "@/features/discipline/components/apply-merits-flow";
import { StudentDisciplinaryView } from "@/features/discipline/components/student-disciplinary-view";
import {
  getMyDisciplinaryRecords,
  getMyMeritApplicationGroup,
} from "@/features/discipline/queries";
import { semesterFilterSchema } from "@/features/semesters/schemas";
import { getAccessContext } from "@/server/auth/access-context";

export const instant = false;

export default async function StudentMeritsDemeritsAndServicesPage({
  searchParams,
}: {
  searchParams: Promise<{
    semester?: string | string[];
    tab?: string | string[];
    apply?: string | string[];
    applied?: string | string[];
    bucket?: string | string[];
  }>;
}) {
  await connection();
  const { semester, tab, apply, applied, bucket } = await searchParams;
  const access = await getAccessContext();

  if (access.status !== "ready" || !access.workspaces.includes("student")) {
    return (
      <WorkspaceShell
        workspace="student"
        destination="merits-demerits-and-services"
        semester={semester}
      />
    );
  }

  const enrolled = access.semesters.filter((s) =>
    access.enrollments.some((e) => e.semester_id === s.id)
  );
  const filter = semesterFilterSchema.safeParse({ semester });
  const selected = !filter.success
    ? undefined
    : filter.data.semester
    ? enrolled.find((s) => s.id === filter.data.semester)
    : enrolled.find((s) => s.is_current) ?? enrolled[0];
  const semesterId = selected?.id;
  const canAct = Boolean(selected?.is_current);

  const path = "/student/merits-demerits-and-services";
  const baseHref = filter.data?.semester ? `${path}?semester=${filter.data.semester}` : path;
  const listHref = baseHref.includes("?")
    ? `${baseHref}&tab=merits`
    : `${baseHref}?tab=merits`;

  let data: Awaited<ReturnType<typeof getMyDisciplinaryRecords>> | null = null;
  let loadFailed = false;
  if (semesterId) {
    try {
      data = await getMyDisciplinaryRecords(semesterId);
    } catch {
      loadFailed = true;
    }
  }

  // WorkspaceShell 404s unknown semesters and explains when none exist.
  let content: React.ReactNode = null;

  if (!semesterId) {
    content = null;
  } else if (loadFailed || !data) {
    content = (
      <Card role="alert" className="flex flex-col items-center justify-center gap-3 p-8 text-center">
        <AlertCircle className="size-8 text-destructive" />
        <p className="text-xs text-muted-foreground">
          Unable to load disciplinary records and balances. Refresh the page to try again.
        </p>
      </Card>
    );
  } else {
    const getParam = (val: string | string[] | undefined) =>
      Array.isArray(val) ? val[0] : val;

    const appliedParam = getParam(applied);
    const bucketParam = getParam(bucket);
    const tabParam = getParam(tab);

    if (appliedParam !== undefined) {
      const application = await getMyMeritApplicationGroup(appliedParam);
      if (!application) {
        redirect(baseHref);
      }
      content = (
        <MeritApplicationResultCard
          application={application}
          summary={data.summary}
          remainingAvailableMerits={data.availableMerits.length}
          listHref={listHref}
        />
      );
    } else if (apply !== undefined) {
      const hasOutstandingDebt =
        data.summary.office.balance > 0 || data.summary.rle.balance > 0;

      if (!canAct || data.availableMerits.length === 0 || !hasOutstandingDebt) {
        redirect(baseHref);
      }

      const initialBucket =
        bucketParam === "office" || bucketParam === "rle" ? bucketParam : null;

      content = (
        <ApplyMeritsFlow
          availableMerits={data.availableMerits}
          summary={data.summary}
          initialBucket={initialBucket}
          listHref={baseHref}
        />
      );
    } else {
      const defaultTab: "demerits" | "merits" | "services" =
        tabParam === "merits" || tabParam === "services" ? tabParam : "demerits";

      content = (
        <StudentDisciplinaryView
          summary={data.summary}
          demerits={data.demerits}
          merits={data.merits}
          serviceCredits={data.serviceCredits}
          canAct={canAct}
          availableMeritCount={data.availableMerits.length}
          defaultTab={defaultTab}
          applyBaseHref={baseHref}
        />
      );
    }
  }

  return (
    <WorkspaceShell
      workspace="student"
      destination="merits-demerits-and-services"
      semester={semester}
    >
      {content}
    </WorkspaceShell>
  );
}
