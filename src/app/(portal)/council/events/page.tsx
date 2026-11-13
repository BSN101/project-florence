import { connection } from "next/server";
import { notFound } from "next/navigation";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { EventDetail, type EventTab } from "@/features/events/components/event-detail";
import { EventList } from "@/features/events/components/event-list";
import { canCapture } from "@/features/events/event-state";
import { getAttendanceCounts, getEventAttendance, getEventRules, getEvents } from "@/features/events/queries";
import { getActiveFineDefinitions } from "@/features/finance/queries";
import { semesterFilterSchema } from "@/features/semesters/schemas";
import { getAccessContext } from "@/server/auth/access-context";

export const instant = false;

export default async function CouncilEventsPage({ searchParams }: {
  searchParams: Promise<{ semester?: string | string[]; event?: string | string[]; tab?: string | string[] }>;
}) {
  await connection();
  const { semester, event: eventParam, tab } = await searchParams;
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
  // Executive/Operations open any published event; Representatives only capture-ready ones.
  if (eventParam !== undefined && (!selected || !(canManage ? selected.audience_frozen_at !== null : canCapture(selected)))) notFound();

  const backHref = `?semester=${semesterId}`;
  let content: React.ReactNode = null;
  if (semesterId && selected) {
    const [attendees, rules] = await Promise.all([
      getEventAttendance(selected.id),
      canManage ? getEventRules([selected.id]) : Promise.resolve([]),
    ]);
    const tabs: EventTab[] = ["attendance", "activity", "details", "consequences"];
    content = (
      <EventDetail event={selected} rules={rules[0] ?? null} attendees={attendees} canManage={canManage}
        viewerId={access.profile.id} backHref={backHref} now={new Date().toISOString()}
        initialTab={tabs.find((t) => t === tab) ?? "attendance"} />
    );
  } else if (semesterId) {
    const [rules, fines, counts] = await Promise.all([
      canManage ? getEventRules(events.map((item) => item.id)) : Promise.resolve([]),
      canManage ? getActiveFineDefinitions() : Promise.resolve([]),
      getAttendanceCounts(events.filter((item) => item.audience_frozen_at).map((item) => item.id)),
    ]);
    content = (
      <EventList events={events} rules={rules} fines={fines} counts={counts} semesterId={semesterId}
        canManage={canManage} now={new Date().toISOString()} />
    );
  }

  return (
    <WorkspaceShell workspace="council" destination="events" semester={semester}>
      {content}
    </WorkspaceShell>
  );
}
