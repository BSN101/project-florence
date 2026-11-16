"use client";

import { Suspense, use, useState } from "react";
import Link from "next/link";
import { CalendarClock, ChevronRight, MapPin, ScanLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { EventCounts, EventDTO } from "../contracts";
import { eventPhase, within } from "../event-state";
import { PhaseBadge } from "./event-badges";

const date = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" });
const time = new Intl.DateTimeFormat("en-PH", { timeStyle: "short", timeZone: "Asia/Manila" });
const at = (value: string | null) => (value ? time.format(new Date(value)) : "—");
const scanHref = (event: EventDTO, side: "time_in" | "time_out") => `/council/events/scan?event=${event.id}&side=${side}`;

function Count({ counts, eventId }: { counts: Promise<Record<string, EventCounts>>; eventId: string }) {
  const c = use(counts)[eventId];
  return c ? <>{c.timedIn} of {c.participants} timed in</> : null;
}

/** What the window is doing right now, for the card's status line. */
function windowLine(event: EventDTO, now: number) {
  if (within(event.time_in_from, event.time_in_until, now)) return `Time-in open until ${at(event.time_in_until)}`;
  if (within(event.time_out_from, event.time_out_until, now)) return `Time-out open until ${at(event.time_out_until)}`;
  if (event.time_out_from && now < Date.parse(event.time_out_from)) return `Time-out opens at ${at(event.time_out_from)}`;
  return "Capture windows have closed";
}

/**
 * The Representative's one screen: events open for attendance as cards with direct scan buttons,
 * then upcoming and earlier events as grouped lists. Representatives never see drafts (FL-015),
 * and the scan station re-checks every capture rule, so the buttons are shortcuts, not permissions.
 */
export function RepresentativeEvents({ events, counts, semesterId, now }: {
  events: EventDTO[];
  /** Streamed from the server; each count suspends until it resolves. */
  counts: Promise<Record<string, EventCounts>>;
  semesterId: string;
  now: string;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const current = Date.parse(now);
  const published = events.filter((event) => event.audience_frozen_at !== null);
  const href = (event: EventDTO) => `?semester=${semesterId}&event=${event.id}`;
  const start = (event: EventDTO) => Date.parse(event.time_in_from ?? event.starts_at);

  const archived = published.filter((event) => event.archived_at !== null);
  const active = published.filter((event) => event.archived_at === null);
  const live = active.filter((event) => eventPhase(event, current) === "open").sort((a, b) => start(a) - start(b));
  const upcoming = active.filter((event) => eventPhase(event, current) === "upcoming").sort((a, b) => start(a) - start(b));
  const earlier = active.filter((event) => ["closed", "generated"].includes(eventPhase(event, current))).sort((a, b) => start(b) - start(a));

  function list(title: string, items: EventDTO[]) {
    if (items.length === 0) return null;
    return (
      <section aria-labelledby={`events-${title}`} className="flex flex-col gap-2">
        <h2 id={`events-${title}`} className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h2>
        <ul className="divide-y divide-border/70 overflow-hidden rounded-2xl bg-card">
          {items.map((event) => (
            <li key={event.id}>
              <Link href={href(event)} transitionTypes={["nav-forward"]} className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors duration-150 [-webkit-tap-highlight-color:transparent] active:bg-muted [@media(hover:hover)]:hover:bg-muted/60">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{event.name}</p>
                  <p className="truncate text-xs text-muted-foreground tabular-nums">
                    {date.format(new Date(start(event)))} · {at(event.time_in_from ?? event.starts_at)}{event.venue && ` · ${event.venue}`}
                  </p>
                  {/* Phones: the badge goes under the date so it never squeezes the event name. */}
                  <div className="mt-1.5 sm:hidden"><PhaseBadge phase={eventPhase(event, current)} event={event} /></div>
                </div>
                <div className="max-sm:hidden"><PhaseBadge phase={eventPhase(event, current)} event={event} /></div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (showArchived) {
    return (
      <div className="flex flex-col gap-6">
        {list("Archived", archived) ?? <p className="py-12 text-center text-sm text-muted-foreground">No archived events in this semester.</p>}
        <Button variant="ghost" className="self-center" onClick={() => setShowArchived(false)}>Show current events</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="events-now" className="flex flex-col gap-3">
        <h2 id="events-now" className="section-title text-foreground">Open for attendance</h2>
        {live.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl bg-card px-6 py-10 text-center">
            <CalendarClock className="size-8 text-muted-foreground" aria-hidden />
            <p className="font-medium text-foreground">No event is open for attendance right now</p>
            {upcoming[0] && (
              <p className="text-sm text-muted-foreground">
                Next: {upcoming[0].name}, {date.format(new Date(start(upcoming[0])))} at {at(upcoming[0].time_in_from ?? upcoming[0].starts_at)}
              </p>
            )}
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {live.map((event) => {
              const timeIn = within(event.time_in_from, event.time_in_until, current);
              const timeOut = within(event.time_out_from, event.time_out_until, current);
              return (
                <li key={event.id} className="flex flex-col gap-4 rounded-xl bg-card p-4">
                  <Link href={href(event)} transitionTypes={["nav-forward"]} className="group flex items-start gap-3 rounded-sm">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-heading text-lg font-medium text-foreground group-hover:underline underline-offset-4">{event.name}</p>
                      {event.venue && <p className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="size-3.5" aria-hidden />{event.venue}</p>}
                      <p className="text-sm text-muted-foreground tabular-nums">{windowLine(event, current)}</p>
                    </div>
                    <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                  {(timeIn || timeOut) && (
                    <div className="grid grid-cols-2 gap-2">
                      <Button className="h-12 gap-2 rounded-sm text-[15px]" variant={timeIn ? "default" : "outline"} disabled={!timeIn}
                        nativeButton={!timeIn} render={timeIn ? <Link href={scanHref(event, "time_in")} /> : undefined}>
                        <ScanLine className="size-4" aria-hidden /> Time in
                      </Button>
                      <Button className="h-12 gap-2 rounded-sm text-[15px]" variant={timeOut ? "default" : "outline"} disabled={!timeOut}
                        nativeButton={!timeOut} render={timeOut ? <Link href={scanHref(event, "time_out")} /> : undefined}>
                        <ScanLine className="size-4" aria-hidden /> Time out
                      </Button>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground tabular-nums">
                    <Suspense fallback={<span className="inline-block h-3 w-24 animate-pulse rounded bg-muted align-middle" aria-hidden />}>
                      <Count counts={counts} eventId={event.id} />
                    </Suspense>
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {list("Upcoming", upcoming)}
      {list("Earlier", earlier)}

      {archived.length > 0 && (
        <Button variant="ghost" className="self-center text-muted-foreground" onClick={() => setShowArchived(true)}>Show archived events</Button>
      )}
    </div>
  );
}
