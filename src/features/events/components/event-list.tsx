"use client";

import { Suspense, use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Archive, CalendarDays, ChevronRight, Edit2, Eye, Gavel, Plus, Search, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableEmpty, TableFrame, usePagedRows } from "@/features/discipline/components/table-controls";
import type { FineDefinitionDTO } from "@/features/finance/contracts";
import { archiveEvent, publishEvent } from "../actions";
import type { EventCounts, EventDTO, EventRulesDTO } from "../contracts";
import { byPriority, eventPhase, type EventPhase } from "../event-state";
import { ConfirmEventDialog } from "./confirm-event-dialog";
import { PhaseBadge } from "./event-badges";
import { Chips } from "./event-detail";
import { EventFormDialog } from "./event-form-dialog";

const date = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" });
const time = new Intl.DateTimeFormat("en-PH", { timeStyle: "short", timeZone: "Asia/Manila" });

function schedule(event: EventDTO) {
  const from = event.time_in_from ?? event.starts_at;
  return {
    day: date.format(new Date(from)),
    hours: `${time.format(new Date(from))} – ${time.format(new Date(event.time_in_until ?? event.ends_at))}`,
  };
}

function AttendanceCount({ counts, eventId }: { counts: Promise<Record<string, EventCounts>>; eventId: string }) {
  const c = use(counts)[eventId];
  return c ? `${c.timedIn}/${c.participants} in` : "—";
}

export function EventList({
  events,
  rules,
  fines,
  counts,
  semesterId,
  canManage,
  now,
}: {
  events: EventDTO[];
  rules: EventRulesDTO[];
  fines: FineDefinitionDTO[];
  /** Streamed from the server; each attendance cell suspends until it resolves. */
  counts: Promise<Record<string, EventCounts>>;
  semesterId: string;
  canManage: boolean;
  now: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<"all" | EventPhase>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<EventDTO | "new" | null>(null);
  const [confirming, setConfirming] = useState<{ event: EventDTO; kind: "publish" | "archive" } | null>(null);
  const current = Date.parse(now);
  // Representatives see every published event (FL-015) but never drafts.
  const shown = events.filter((event) => canManage || event.audience_frozen_at !== null).sort(byPriority(current));
  const count = (p: EventPhase) => shown.filter((event) => eventPhase(event, current) === p).length;
  const needle = query.trim().toLowerCase();
  const visible = shown.filter((event) => (phase === "all" ? event.archived_at === null : eventPhase(event, current) === phase)
    && (!needle || `${event.name} ${event.venue ?? ""}`.toLowerCase().includes(needle)));
  const { pageRows, pager } = usePagedRows(visible, `${phase}|${needle}`);
  const filtered = phase !== "all" || needle !== "";
  const phaseOptions: [("all" | EventPhase), string][] = [
    ["all", `All (${shown.length - count("archived")})`], ["open", `Open (${count("open")})`], ["upcoming", `Upcoming (${count("upcoming")})`],
    ["closed", `${canManage ? "Needs consequences" : "Closed"} (${count("closed")})`],
    ...(canManage ? [["draft", `Draft (${count("draft")})`] as [EventPhase, string]] : []),
    ["generated", `Done (${count("generated")})`], ["archived", `Archived (${count("archived")})`],
  ];
  const waiting = canManage ? events.filter((event) => eventPhase(event, current) === "closed") : [];
  const href = (event: EventDTO, tab?: string) => `?semester=${semesterId}&event=${event.id}${tab ? `&tab=${tab}` : ""}`;
  // Drafts have no event page yet.
  const opens = (event: EventDTO) => event.audience_frozen_at !== null;

  // Whole row/card opens the event; the name stays a real link for keyboard and screen readers.
  function rowProps(event: EventDTO) {
    return opens(event)
      ? { onClick: () => router.push(href(event), { transitionTypes: ["nav-forward"] }), className: "cursor-pointer transition-colors hover:bg-muted/40" }
      : { className: "" };
  }
  // Buttons inside a clickable row keep their own action.
  const own = (e: React.MouseEvent) => e.stopPropagation();

  function attendance(event: EventDTO) {
    return (
      <Suspense fallback={<span className="inline-block h-3 w-12 animate-pulse rounded bg-muted align-middle" aria-hidden="true" />}>
        <AttendanceCount counts={counts} eventId={event.id} />
      </Suspense>
    );
  }

  function title(event: EventDTO) {
    return opens(event)
      ? <Link href={href(event)} transitionTypes={["nav-forward"]} onClick={own} className="font-medium text-foreground underline-offset-4 hover:underline">{event.name}</Link>
      : <span className="font-medium text-foreground">{event.name}</span>;
  }

  function actions(event: EventDTO) {
    return (
      <>
        {canManage && eventPhase(event, current) === "closed" && (
          <Button size="sm" className="gap-1 text-xs" nativeButton={false} render={<Link href={href(event, "consequences")} transitionTypes={["nav-forward"]} />}>
            <Gavel className="size-3.5" /> Review consequences
          </Button>
        )}
        {canManage && (
          <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={() => setEditing(event)}>
            {event.audience_frozen_at || event.archived_at
              ? <><Eye className="size-3.5" /> Setup</>
              : <><Edit2 className="size-3.5" /> Edit</>}
          </Button>
        )}
        {canManage && !event.audience_frozen_at && !event.archived_at && (
          <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={() => setConfirming({ event, kind: "publish" })}>
            <Send className="size-3.5" /> Publish
          </Button>
        )}
        {canManage && !event.archived_at && (
          <Button size="sm" variant="ghost" className="gap-1 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setConfirming({ event, kind: "archive" })}>
            <Archive className="size-3.5" /> Archive
          </Button>
        )}
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="section-title text-foreground">Events</h2>
          <p className="text-sm text-muted-foreground">
            {canManage ? "Configure events, publish their audience and follow attendance." : "View events and record attendance while capture is open."}
          </p>
        </div>
        {canManage && (
          <Button type="button" onClick={() => setEditing("new")} className="gap-1.5">
            <Plus className="size-4" /> New event
          </Button>
        )}
      </div>

      {waiting.length > 0 && phase !== "archived" && (
        <div role="status" className="flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" />
            {waiting.length === 1 ? "1 event is" : `${waiting.length} events are`} waiting for consequences
          </p>
          <ul className="flex flex-wrap gap-x-3 gap-y-1">
            {waiting.map((event) => (
              <li key={event.id}>
                <Link href={href(event, "consequences")} transitionTypes={["nav-forward"]} className="inline-flex items-center gap-0.5 underline underline-offset-4">
                  {event.name} <ChevronRight className="size-3.5" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <TableFrame pager={pager} filters={
        <div className="flex w-full flex-col gap-2">
          <Chips label="Filter by status" value={phase} onChange={setPhase} options={phaseOptions} />
          <div className="relative sm:max-w-xs">
            <Search aria-hidden="true" className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Search events by name or venue" placeholder="Search name or venue" className="pl-8"
              value={query} onChange={(e) => setQuery(e.target.value)} maxLength={100} />
          </div>
        </div>
      }>
        {visible.length === 0 ? (
          <TableEmpty icon={CalendarDays} filtered={filtered} title="No events in this semester"
            text={canManage ? "Create an event to start taking attendance." : "Published events will appear here."} />
        ) : (
          <>
            {/* Phones: one card per event instead of a sideways-scrolling table. */}
            <ul className="divide-y divide-border sm:hidden">
              {pageRows.map((event) => (
                <li key={event.id} {...rowProps(event)} className={`space-y-2 px-4 py-3 ${rowProps(event).className}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {title(event)}
                      <p className="text-xs text-muted-foreground">
                        {schedule(event).day} · {schedule(event).hours}{event.venue && ` · ${event.venue}`}
                      </p>
                    </div>
                    <PhaseBadge phase={eventPhase(event, current)} event={event} />
                  </div>
                  {event.audience_frozen_at && <p className="text-xs text-muted-foreground">Attendance {attendance(event)}</p>}
                  <div className="flex flex-wrap gap-1" onClick={own}>{actions(event)}</div>
                </li>
              ))}
            </ul>
            <div className="hidden sm:block">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-muted text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3">Event</th>
                    <th scope="col" className="px-4 py-3">Date</th>
                    <th scope="col" className="px-4 py-3">Attendance</th>
                    <th scope="col" className="px-4 py-3">Status</th>
                    <th scope="col" className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pageRows.map((event) => (
                    <tr key={event.id} {...rowProps(event)}>
                      <td className="px-4 py-3">
                        {title(event)}
                        {event.venue && <p className="text-xs text-muted-foreground">{event.venue}</p>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                        <p className="text-foreground">{schedule(event).day}</p>
                        <p>{schedule(event).hours}</p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{attendance(event)}</td>
                      <td className="px-4 py-3"><PhaseBadge phase={eventPhase(event, current)} event={event} /></td>
                      <td className="space-x-1 whitespace-nowrap px-4 py-3 text-right" onClick={own}>{actions(event)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </TableFrame>

      {editing && (
        <EventFormDialog
          key={editing === "new" ? "new" : editing.id}
          isOpen
          onClose={() => setEditing(null)}
          semesterId={semesterId}
          event={editing === "new" ? null : editing}
          rules={editing === "new" ? null : rules.find((rule) => rule.event_id === editing.id) ?? null}
          fines={fines}
        />
      )}

      {confirming?.kind === "publish" && (
        <ConfirmEventDialog
          title={`Publish “${confirming.event.name}”?`}
          description="Publishing snapshots the eligible students from the current roster and freezes the audience, attendance windows, lateness threshold and consequences (including fine amounts). Later roster or fine changes will not affect this event. This cannot be undone."
          confirmLabel="Publish event"
          onConfirm={() => publishEvent({ eventId: confirming.event.id })}
          onClose={() => setConfirming(null)}
        />
      )}
      {confirming?.kind === "archive" && (
        <ConfirmEventDialog
          title={`Archive “${confirming.event.name}”?`}
          description="Archived events are hidden from active lists and closed to attendance capture. Recorded attendance and any consequences are kept."
          confirmLabel="Archive event"
          destructive
          onConfirm={() => archiveEvent({ eventId: confirming.event.id })}
          onClose={() => setConfirming(null)}
        />
      )}
    </div>
  );
}
