import { connection } from "next/server";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { getStudentClearanceSummary } from "@/features/clearance/queries";
import { getMyDisciplinaryRecords } from "@/features/discipline/queries";
import { getMyEvents } from "@/features/events/queries";
import { getStudentFinancialAccount } from "@/features/finance/queries";
import { semesterFilterSchema } from "@/features/semesters/schemas";
import { StudentHomeView } from "@/features/students/components/student-home-view";
import { findNextUpcomingEvent } from "@/features/events/event-state";
import { settleCard, type StudentDashboardData } from "@/features/students/dashboard";
import { generateAttendanceQrDataUrl } from "@/features/students/qr";
import { displayName } from "@/lib/format-name";
import { getAccessContext } from "@/server/auth/access-context";

export const instant = false;

export default async function StudentPage({
  searchParams,
}: {
  searchParams: Promise<{ semester?: string | string[] }>;
}) {
  await connection();
  const { semester } = await searchParams;
  const access = await getAccessContext();
  if (access.status !== "ready" || !access.workspaces.includes("student")) {
    return (
      <WorkspaceShell workspace="student" destination="" semester={semester} />
    );
  }

  // Same selection as WorkspaceShell: only semesters the student is enrolled in.
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

  const profile = access.profile;
  const universityId = profile?.university_id;
  const studentName = profile ? displayName(profile) : "Student";
  const currentEnrollment = access.enrollments.find(
    (e) => e.semester_id === semesterId
  );

  const nowIso = new Date().toISOString();

  // Started, not awaited: each card streams in behind its own <Suspense> while the QR renders.
  const finance = settleCard(
    semesterId ? getStudentFinancialAccount({ semesterId }).then((r) => r.summary) : null,
    "financial account",
  );
  const discipline = settleCard(
    semesterId ? getMyDisciplinaryRecords(semesterId).then((r) => r.summary) : null,
    "disciplinary records",
  );
  const clearance = settleCard(semesterId ? getStudentClearanceSummary(semesterId) : null, "clearance");
  const events = settleCard(
    semesterId ? getMyEvents(semesterId).then((rows) => findNextUpcomingEvent(rows, nowIso)) : null,
    "events",
  );

  let qrDataUrl: string | null = null;
  let qrError: string | null = null;

  if (universityId) {
    try {
      qrDataUrl = await generateAttendanceQrDataUrl(universityId);
    } catch {
      qrError =
        "Unable to generate attendance QR code. Please ensure your student number is formatted properly.";
    }
  }

  const dashboardData: StudentDashboardData = {
    student: {
      name: studentName,
      universityId: universityId ?? "",
      yearLevel: currentEnrollment?.year_level,
      academicStatus: currentEnrollment?.academic_status,
    },
    qrDataUrl,
    qrError,
    finance,
    discipline,
    clearance,
    events,
  };

  return (
    <WorkspaceShell workspace="student" destination="" semester={semester}>
      <StudentHomeView
        data={dashboardData}
        semesterId={semesterId}
        renderedAt={nowIso}
      />
    </WorkspaceShell>
  );
}
