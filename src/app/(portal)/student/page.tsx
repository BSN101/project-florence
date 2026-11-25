import { connection } from "next/server";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { getStudentClearanceSummary } from "@/features/clearance/queries";
import { getMyDisciplinaryRecords } from "@/features/discipline/queries";
import { getMyEvents } from "@/features/events/queries";
import { getStudentFinancialAccount } from "@/features/finance/queries";
import { semesterFilterSchema } from "@/features/semesters/schemas";
import { StudentHomeView } from "@/features/students/components/student-home-view";
import {
  findNextUpcomingEvent,
  type StudentDashboardData,
} from "@/features/students/dashboard";
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

  const [
    financeRes,
    disciplineRes,
    clearanceRes,
    eventsRes,
  ] = await Promise.allSettled([
    semesterId
      ? getStudentFinancialAccount({ semesterId })
      : Promise.resolve(null),
    semesterId
      ? getMyDisciplinaryRecords(semesterId)
      : Promise.resolve(null),
    semesterId
      ? getStudentClearanceSummary(semesterId)
      : Promise.resolve(null),
    semesterId ? getMyEvents(semesterId) : Promise.resolve([]),
  ]);

  const financeSummary =
    financeRes.status === "fulfilled" && financeRes.value
      ? financeRes.value.summary
      : null;
  const financeError =
    financeRes.status === "rejected"
      ? "Unable to load financial records."
      : null;

  const disciplineSummary =
    disciplineRes.status === "fulfilled" && disciplineRes.value
      ? disciplineRes.value.summary
      : null;
  const disciplineError =
    disciplineRes.status === "rejected"
      ? "Unable to load disciplinary records."
      : null;

  const clearanceSummary =
    clearanceRes.status === "fulfilled" && clearanceRes.value
      ? clearanceRes.value
      : null;
  const clearanceError =
    clearanceRes.status === "rejected"
      ? "Unable to load clearance records."
      : null;

  const rawEvents =
    eventsRes.status === "fulfilled" && Array.isArray(eventsRes.value)
      ? eventsRes.value
      : [];
  const eventsError =
    eventsRes.status === "rejected" ? "Unable to load events." : null;
  const { highlight, totalUpcoming } = findNextUpcomingEvent(
    rawEvents,
    nowIso
  );

  const dashboardData: StudentDashboardData = {
    student: {
      name: studentName,
      universityId: universityId ?? "",
      yearLevel: currentEnrollment?.year_level,
      academicStatus: currentEnrollment?.academic_status,
    },
    qrDataUrl,
    qrError,
    finance: {
      summary: financeSummary,
      error: financeError,
    },
    discipline: {
      summary: disciplineSummary,
      error: disciplineError,
    },
    clearance: {
      summary: clearanceSummary,
      error: clearanceError,
    },
    events: {
      highlight,
      totalUpcoming,
      error: eventsError,
    },
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
