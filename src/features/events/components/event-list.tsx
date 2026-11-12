"use client";

import { useState } from "react";
import Link from "next/link";
import { Archive, ClipboardCheck, Edit2, Eye, Plus, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { FineDefinitionDTO } from "@/features/finance/contracts";
import { archiveEvent, publishEvent } from "../actions";
import type { EventDTO, EventRulesDTO } from "../contracts";
import { canCapture } from "../event-state";
import { ConfirmEventDialog } from "./confirm-event-dialog";
import { EventFormDialog } from "./event-form-dialog";

const dateTime = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });

function Badge({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "primary" | "success" }) {
  const tones = {
    muted: "bg-muted text-muted-foreground",
    primary: "bg-primary/10 text-primary",
    success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  };
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function EventList({
  events,
  rules,
  fines,
  semesterId,
  canManage,
  now,
}: {
  events: EventDTO[];
  rules: EventRulesDTO[];
  fines: FineDefinitionDTO[];
  semesterId: string;
  canManage: boolean;
  now: string;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<EventDTO | "new" | null>(null);
  const [confirming, setConfirming] = useState<{ event: EventDTO; kind: "publish" | "archive" } | null>(null);
  const current = Date.parse(now);
  // Representatives only work with capture-ready events.
  const visible = events.filter((event) =>
    canManage ? (showArchived ? event.archived_at !== null : event.archived_at === null) : canCapture(event));

  function schedule(event: EventDTO) {
    if (current < Date.parse(event.starts_at)) return "Upcoming";
    return current <= Date.parse(event.ends_at) ? "Ongoing" : "Past";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Events</h2>
          <p className="text-sm text-muted-foreground">
            {canManage ? "Configure events, publish their audience and record attendance." : "Record attendance for published events."}
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setShowArchived((value) => !value)}>
              {showArchived ? "Show active" : "Show archived"}
            </Button>
            <Button type="button" onClick={() => setEditing("new")} className="gap-1.5">
              <Plus className="size-4" /> New event
            </Button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        {visible.length === 0 ? (
          <p className="py-12 text-center text-sm font-medium text-muted-foreground">
            {canManage ? "No events in this semester." : "No events are open for attendance in this semester."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th scope="col" className="px-6 py-3">Event</th>
                  <th scope="col" className="px-6 py-3">Schedule</th>
                  <th scope="col" className="px-6 py-3">Status</th>
                  <th scope="col" className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((event) => (
                  <tr key={event.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-6 py-4">
                      <p className="font-medium text-foreground">{event.name}</p>
                      {event.venue && <p className="text-xs text-muted-foreground">{event.venue}</p>}
                    </td>
                    <td className="px-6 py-4 text-xs text-muted-foreground">
                      {dateTime.format(new Date(event.starts_at))} – {dateTime.format(new Date(event.ends_at))}
                    </td>
                    <td className="space-x-1 px-6 py-4">
                      <Badge>{schedule(event)}</Badge>
                      {event.archived_at ? <Badge>Archived</Badge>
                        : event.attendance_locked_at ? <Badge>Attendance locked</Badge>
                        : event.audience_frozen_at ? <Badge tone="success">Published</Badge>
                        : <Badge tone="primary">Draft</Badge>}
                    </td>
                    <td className="space-x-1 whitespace-nowrap px-6 py-4 text-right">
                      {canCapture(event) && (
                        <Button size="sm" variant="ghost" className="gap-1 text-xs" nativeButton={false}
                          render={<Link href={`?semester=${semesterId}&event=${event.id}`} />}>
                          <ClipboardCheck className="size-3.5" /> Attendance
                        </Button>
                      )}
                      {canManage && (
                        <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={() => setEditing(event)}>
                          {event.audience_frozen_at || event.archived_at
                            ? <><Eye className="size-3.5" /> View</>
                            : <><Edit2 className="size-3.5" /> Edit</>}
                        </Button>
                      )}
                      {canManage && !event.audience_frozen_at && !event.archived_at && (
                        <Button size="sm" variant="ghost" className="gap-1 text-xs"
                          onClick={() => setConfirming({ event, kind: "publish" })}>
                          <Send className="size-3.5" /> Publish
                        </Button>
                      )}
                      {canManage && !event.archived_at && (
                        <Button size="sm" variant="ghost" className="gap-1 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setConfirming({ event, kind: "archive" })}>
                          <Archive className="size-3.5" /> Archive
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
