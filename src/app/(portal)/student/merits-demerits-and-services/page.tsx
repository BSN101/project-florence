import { connection } from "next/server";
import { redirect } from "next/navigation";
import { AlertCircle } from "lucide-react";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { Card } from "@/components/ui/card";
import {
  ApplyMeritsFlow,
  MeritApplicationResultCard,
} from "@/features/discipline/components/apply-merits-flow";
import { canApplyMerits } from "@/features/discipline/calculations";
import { StudentDisciplinaryReport } from "@/features/discipline/components/student-disciplinary-report";
import { StudentDisciplinaryView } from "@/features/discipline/components/student-disciplinary-view";
import {
  getMyDisciplinaryRecords,
  getMyMeritApplicationGroup,
} from "@/features/discipline/queries";
import { parseReportRouteParams } from "@/features/discipline/report-calculations";
import { getStudentDisciplinaryReportForAccess } from "@/features/discipline/report-queries";
import { resolveSelectedSemester } from "@/features/semesters/schemas";
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
    report?: string | string[];
    year?: string | string[];
  }>;
}) {
  await connection();
  const { semester, tab, apply, applied, bucket, report, year } = await searchParams;
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
  const selected = resolveSelectedSemester(enrolled, semester);

  // Malformed or non-enrolled `?semester=` is handled by WorkspaceShell's 404 gate.
  if (selected === null) {
    return (
      <WorkspaceShell
        workspace="student"
        destination="merits-demerits-and-services"
        semester={semester}
      />
    );
  }

  const explicitSemesterParam = typeof semester === "string" && selected ? selected.id : undefined;
  const path = "/student/merits-demerits-and-services";
  const baseHref = explicitSemesterParam ? `${path}?semester=${explicitSemesterParam}` : path;

  let content: React.ReactNode = null;

  if (report !== undefined && applied === undefined && apply === undefined) {
    const parsedReport = parseReportRouteParams({ report, year });
    if (!parsedReport) {
      redirect(baseHref);
    }

    const snapshot = new Date();

    let reportData: Awaited<ReturnType<typeof getStudentDisciplinaryReportForAccess>> = null;
    let reportLoadFailed = false;

    try {
      reportData = await getStudentDisciplinaryReportForAccess(
        access,
        {
          scope: parsedReport.scope,
          semesterId: selected?.id ?? null,
          academicYearStart: parsedReport.academicYearStart,
        },
        snapshot
      );
    } catch {
      reportLoadFailed = true;
    }

    if (reportLoadFailed) {
      content = (
        <Card
          role="alert"
          className="flex flex-col items-center justify-center gap-2 p-8 text-center"
        >
          <AlertCircle className="size-8 text-destructive" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">
            Unable to load disciplinary report. Refresh the page to try again.
          </p>
        </Card>
      );
    } else if (!reportData) {
      redirect(baseHref);
    } else {
      const csvHref =
        reportData.scope === "semester" && selected
          ? `${path}/report.csv?scope=semester&semester=${encodeURIComponent(selected.id)}`
          : `${path}/report.csv?scope=year&year=${encodeURIComponent(String(reportData.academicYearStart))}`;

      content = (
        <StudentDisciplinaryReport
          report={reportData}
          backHref={baseHref}
          csvHref={csvHref}
          semesterQueryParam={explicitSemesterParam}
        />
      );
    }
  } else {
    const semesterId = selected?.id;
    const canAct = Boolean(selected?.is_current);
    const listHref = baseHref.includes("?")
      ? `${baseHref}&tab=merits`
      : `${baseHref}?tab=merits`;
    const reportHref = explicitSemesterParam
      ? `${path}?semester=${explicitSemesterParam}&report=semester`
      : `${path}?report=semester`;

    let data: Awaited<ReturnType<typeof getMyDisciplinaryRecords>> | null = null;
    let loadFailed = false;
    if (semesterId) {
      try {
        data = await getMyDisciplinaryRecords(semesterId);
      } catch {
        loadFailed = true;
      }
    }

    if (!semesterId) {
      content = null;
    } else if (loadFailed || !data) {
      content = (
        <Card
          role="alert"
          className="flex flex-col items-center justify-center gap-2 p-8 text-center"
        >
          <AlertCircle className="size-8 text-destructive" aria-hidden="true" />
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
        if (!canApplyMerits(data.summary, data.availableMerits.length, canAct)) {
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
            reportHref={reportHref}
          />
        );
      }
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
