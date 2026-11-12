import { connection } from "next/server";
import { notFound } from "next/navigation";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { AttendanceCapture } from "@/features/events/components/attendance-capture";
import { EventList } from "@/features/events/components/event-list";
import { canCapture } from "@/features/events/event-state";
import { getAttendanceSummary, getEventRules, getEvents } from "@/features/events/queries";
import { getActiveFineDefinitions } from "@/features/finance/queries";
import { semesterFilterSchema } from "@/features/semesters/schemas";
import { getAccessContext } from "@/server/auth/access-context";

export const instant = false;

export default async function CouncilEventsPage({ searchParams }: {
  searchParams: Promise<{ semester?: string | string[]; event?: string | string[] }>;
}) {
  await connection();
  const { semester, event: eventParam } = await searchParams;
  const access = await getAccessContext();
  // WorkspaceShell handles unauthenticated/forbidden states and validates the semester param.
  if (access.status !== "ready" || !access.workspaces.includes("council")) {
    return <WorkspaceShell workspace="council" destination="events" semester={semester} />;
  }

  // Invalid or unknown semester params are rejected by WorkspaceShell; skip queries for them.
  const filter = semesterFilterSchema.safeParse({ semester });
  const semesterId = !filter.success ? undefined : filter.data.semester
    ? access.semesters.find((item) => item.id === filter.data.semester)?.id
    : access.semesters.find((item) => item.is_current)?.id
    ?? access.semesters[0]?.id;
  const canManage = access.councilRole === "executive" || access.councilRole === "operations";
  const events = semesterId ? await getEvents(semesterId) : [];
  const selected = typeof eventParam === "string" ? events.find((item) => item.id === eventParam) : undefined;
  if (eventParam !== undefined && (!selected || !canCapture(selected))) notFound();

  const backHref = `?semester=${semesterId}`;
  let content: React.ReactNode = null;
  if (semesterId && selected) {
    content = (
      <AttendanceCapture event={selected} summary={await getAttendanceSummary(selected.id)}
        viewerId={access.profile.id} backHref={backHref} now={new Date().toISOString()} />
    );
  } else if (semesterId) {
    const [rules, fines] = canManage
      ? await Promise.all([getEventRules(events.map((item) => item.id)), getActiveFineDefinitions()])
      : [[], []];
    content = (
      <EventList events={events} rules={rules} fines={fines} semesterId={semesterId}
        canManage={canManage} now={new Date().toISOString()} />
    );
  }

  return (
    <WorkspaceShell workspace="council" destination="events" semester={semester}>
      {content}
    </WorkspaceShell>
  );
}
