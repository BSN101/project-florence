import { connection } from "next/server";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { StudentEvents } from "@/features/events/components/student-events";
import { getMyEvents, getMyFeedback } from "@/features/events/queries";
import { semesterFilterSchema } from "@/features/semesters/schemas";
import { getAccessContext } from "@/server/auth/access-context";

export const instant = false;

export default async function StudentEventsPage({ searchParams }: {
  searchParams: Promise<{ semester?: string | string[] }>;
}) {
  await connection();
  const { semester } = await searchParams;
  const access = await getAccessContext();
  // WorkspaceShell handles unauthenticated/forbidden states and validates the semester param.
  if (access.status !== "ready" || !access.workspaces.includes("student")) {
    return <WorkspaceShell workspace="student" destination="events" semester={semester} />;
  }

  // Same selection as WorkspaceShell: only semesters the student is enrolled in.
  const enrolled = access.semesters.filter((s) => access.enrollments.some((e) => e.semester_id === s.id));
  const filter = semesterFilterSchema.safeParse({ semester });
  const semesterId = !filter.success ? undefined : filter.data.semester
    ? enrolled.find((s) => s.id === filter.data.semester)?.id
    : enrolled.find((s) => s.is_current)?.id ?? enrolled[0]?.id;

  let content: React.ReactNode = null;
  if (semesterId) {
    const [events, allFeedback] = await Promise.all([getMyEvents(semesterId), getMyFeedback(access.profile.id)]);
    // Only this semester's answers reach the client.
    const feedback = Object.fromEntries(events.filter((e) => allFeedback[e.event_id]).map((e) => [e.event_id, allFeedback[e.event_id]]));
    content = <StudentEvents events={events} feedback={feedback} now={new Date().toISOString()} />;
  }

  return (
    <WorkspaceShell workspace="student" destination="events" semester={semester}>
      {content}
    </WorkspaceShell>
  );
}
