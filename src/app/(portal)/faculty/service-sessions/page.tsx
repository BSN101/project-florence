import { connection } from "next/server";
import { redirect } from "next/navigation";
import { AlertCircle } from "lucide-react";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { Card } from "@/components/ui/card";
import {
  allowedServiceBuckets,
  canCreateServiceSession,
  canManageSession,
  evaluateFinalizationEligibility,
  getTodayManila,
} from "@/features/services/calculations";
import { CreateSessionFlow } from "@/features/services/components/create-session-flow";
import { ServiceSessionDetail } from "@/features/services/components/service-session-detail";
import { ServiceSessionList } from "@/features/services/components/service-session-list";
import type {
  AvailableServiceStudent,
  ServiceSessionDetail as ServiceSessionDetailType,
  ServiceSessionSummary,
} from "@/features/services/contracts";
import {
  getAvailableServiceStudents,
  getMyServiceSessions,
  getServiceSessionDetail,
} from "@/features/services/queries";
import { semesterFilterSchema } from "@/features/semesters/schemas";
import { getAccessContext } from "@/server/auth/access-context";

export const instant = false;

const path = "/faculty/service-sessions";

export default async function FacultyServiceSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    semester?: string | string[];
    session?: string | string[];
    create?: string | string[];
  }>;
}) {
  await connection();
  const { semester, session, create } = await searchParams;
  const access = await getAccessContext();

  // Access check: WorkspaceShell handles redirection for unauthenticated or non-faculty actors
  if (access.status !== "ready" || !access.workspaces.includes("faculty")) {
    return (
      <WorkspaceShell
        workspace="faculty"
        destination="service-sessions"
        semester={semester}
      />
    );
  }

  // Parse semester filter against accessible semesters
  const filter = semesterFilterSchema.safeParse({ semester });
  const selected = !filter.success
    ? undefined
    : filter.data.semester
    ? access.semesters.find((s) => s.id === filter.data.semester)
    : access.semesters.find((s) => s.is_current) ?? access.semesters[0];

  // Invalid or unknown semester: let WorkspaceShell return 404 before any redirect below runs.
  if (!filter.success || (filter.data.semester && !selected)) {
    return (
      <WorkspaceShell
        workspace="faculty"
        destination="service-sessions"
        semester={semester}
      />
    );
  }

  const semesterId = selected?.id;
  const isCurrentSemester = Boolean(selected?.is_current);
  const allowedBuckets = allowedServiceBuckets(access.roles);
  const canCreate = canCreateServiceSession(access.roles, isCurrentSemester);
  const isCoordinator =
    access.roles.includes("Academic Coordinator") ||
    access.roles.includes("RLE Coordinator");

  const renderedAt = new Date().toISOString();
  const baseHref = filter.data.semester
    ? `${path}?semester=${filter.data.semester}`
    : path;

  const getParam = (val: string | string[] | undefined) =>
    Array.isArray(val) ? val[0] : val;

  const sessionParam = getParam(session);

  let content: React.ReactNode = null;

  // 1. Detail Branch: ?session=<uuid> (checked first)
  if (sessionParam !== undefined) {
    let detail: ServiceSessionDetailType | null = null;
    let loadFailed = false;

    try {
      detail = await getServiceSessionDetail(sessionParam);
    } catch {
      loadFailed = true;
    }

    // Safely bounce invalid UUIDs or inaccessible sessions outside try...catch
    if (!loadFailed && !detail) {
      redirect(baseHref);
    }

    if (loadFailed || !detail) {
      content = (
        <Card
          role="alert"
          className="flex flex-col items-center justify-center gap-3 p-8 text-center"
        >
          <AlertCircle className="size-8 text-destructive" />
          <p className="text-sm text-muted-foreground">
            Unable to load service session details. Refresh the page to try again.
          </p>
        </Card>
      );
    } else {
      const sessionSemester = access.semesters.find(
        (s) => s.id === detail.semester_id
      );
      const isSessionCurrentSemester = Boolean(sessionSemester?.is_current);
      const isOwner = detail.created_by === access.profile.id;
      const canManage = canManageSession(
        detail,
        access.profile.id,
        isSessionCurrentSemester
      );
      const eligibility = evaluateFinalizationEligibility(
        detail,
        detail.participants,
        access.profile.id,
        access.roles,
        renderedAt
      );
      const canShowFinalize =
        detail.ended_at === null &&
        isOwner &&
        allowedServiceBuckets(access.roles).includes(detail.bucket);

      // Least-privilege optimization: only fetch eligible student candidates when session can be managed
      let availableStudents: AvailableServiceStudent[] = [];
      let studentsLoadFailed = false;
      if (canManage) {
        try {
          const participantIds = detail.participants.map((p) => p.student_id);
          availableStudents = await getAvailableServiceStudents(
            detail.semester_id,
            participantIds
          );
        } catch {
          studentsLoadFailed = true;
        }
      }

      content = (
        <ServiceSessionDetail
          session={detail}
          availableStudents={availableStudents}
          studentsLoadFailed={studentsLoadFailed}
          renderedAt={renderedAt}
          canManage={canManage}
          canShowFinalize={canShowFinalize}
          eligibility={eligibility}
          isOwner={isOwner}
          isCurrentSemester={isSessionCurrentSemester}
          listHref={baseHref}
        />
      );
    }
  }
  // 2. Wizard Branch: ?create
  else if (create !== undefined) {
    // Cold-visit guard: bounce unauthorized or non-current attempts outside try...catch
    if (!canCreate) {
      redirect(baseHref);
    }

    const today = getTodayManila();
    let initialDutyOn = today;
    if (selected?.starts_on && today < selected.starts_on) {
      initialDutyOn = selected.starts_on;
    } else if (selected?.ends_on && today > selected.ends_on) {
      initialDutyOn = selected.ends_on;
    }

    content = (
      <CreateSessionFlow
        allowedBuckets={allowedBuckets}
        initialDutyOn={initialDutyOn}
        listHref={baseHref}
        semesterStartsOn={selected?.starts_on}
        semesterEndsOn={selected?.ends_on}
      />
    );
  }
  // 3. Default List Branch
  else if (semesterId) {
    let sessions: ServiceSessionSummary[] | null = null;
    let loadFailed = false;

    try {
      sessions = await getMyServiceSessions(semesterId);
    } catch {
      loadFailed = true;
    }

    if (loadFailed || !sessions) {
      content = (
        <Card
          role="alert"
          className="flex flex-col items-center justify-center gap-3 p-8 text-center"
        >
          <AlertCircle className="size-8 text-destructive" />
          <p className="text-sm text-muted-foreground">
            Unable to load service sessions. Refresh the page to try again.
          </p>
        </Card>
      );
    } else {
      content = (
        <ServiceSessionList
          sessions={sessions}
          canCreate={canCreate}
          isCurrentSemester={isCurrentSemester}
          hasInstructorRole={allowedBuckets.length > 0}
          showCreator={isCoordinator}
          baseHref={baseHref}
          renderedAt={renderedAt}
        />
      );
    }
  }

  return (
    <WorkspaceShell
      workspace="faculty"
      destination="service-sessions"
      semester={semester}
    >
      {content}
    </WorkspaceShell>
  );
}
