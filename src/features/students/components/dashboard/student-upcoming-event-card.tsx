import Link from "next/link";
import { CalendarDays, ChevronRight, MapPin } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { UpcomingEventHighlight } from "@/features/students/dashboard";

const dateFormat = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "Asia/Manila",
});

const timeFormat = new Intl.DateTimeFormat("en-PH", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Manila",
});

export function StudentUpcomingEventCard({
  highlight,
  totalUpcoming,
  error,
  semesterId,
}: {
  highlight: UpcomingEventHighlight | null;
  totalUpcoming: number;
  error: string | null;
  semesterId?: string;
}) {
  const href = semesterId
    ? `/student/events?semester=${encodeURIComponent(semesterId)}`
    : "/student/events";

  const event = highlight?.event;
  const startTime = event?.time_in_from ? new Date(event.time_in_from) : null;

  return (
    <Card className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 sm:p-6 transition-colors hover:border-primary/40 shadow-2xs">
      <div className="flex flex-col gap-3">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <CalendarDays className="size-5" />
            </div>
            <h3 className="font-heading text-sm font-semibold text-foreground truncate">
              Events & Attendance
            </h3>
          </div>
          {highlight && (
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                highlight.isOngoing
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "bg-blue-500/10 text-blue-700 dark:text-blue-400"
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${
                  highlight.isOngoing
                    ? "bg-emerald-600 dark:bg-emerald-400 animate-pulse"
                    : "bg-blue-600 dark:bg-blue-400"
                }`}
              />
              {highlight.isOngoing ? "Happening Now" : "Upcoming"}
            </span>
          )}
        </div>

        {/* Metric content */}
        {error ? (
          <p className="text-xs text-destructive">
            Unable to load scheduled events. Tap below to inspect.
          </p>
        ) : event ? (
          <div className="flex flex-col gap-1.5 min-w-0">
            <h4 className="font-heading text-base font-semibold text-foreground truncate" title={event.name}>
              {event.name}
            </h4>
            <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              {startTime && (
                <span className="tabular-nums">
                  {dateFormat.format(startTime)} • {timeFormat.format(startTime)}
                </span>
              )}
              {event.venue && (
                <div className="flex items-center gap-1 truncate text-muted-foreground">
                  <MapPin className="size-3.5 shrink-0" />
                  <span className="truncate">{event.venue}</span>
                </div>
              )}
            </div>
            {totalUpcoming > 1 && (
              <span className="text-[11px] text-muted-foreground tabular-nums">
                +{totalUpcoming - 1} more scheduled event{totalUpcoming - 1 === 1 ? "" : "s"} this semester
              </span>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1 py-1">
            <p className="font-heading text-sm font-medium text-foreground">
              No upcoming events scheduled
            </p>
            <p className="text-xs text-muted-foreground">
              Check back later or browse past semester events.
            </p>
          </div>
        )}
      </div>

      {/* Footer link */}
      <Link
        href={href}
        className="mt-4 flex min-h-[44px] items-center justify-between rounded-xl bg-muted/30 px-3.5 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/60"
      >
        <span>Browse all events & attendance claims</span>
        <ChevronRight className="size-4 text-muted-foreground" />
      </Link>
    </Card>
  );
}
