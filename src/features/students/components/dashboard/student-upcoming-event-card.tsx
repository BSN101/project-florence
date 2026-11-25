import { use } from "react";
import { CalendarDays, MapPin } from "lucide-react";

import type { UpcomingEventHighlight } from "@/features/events/event-state";
import { buildSemesterHref, type CardResult } from "@/features/students/dashboard";
import { DashboardSummaryCard } from "./dashboard-summary-card";

const dateFormat = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeZone: "Asia/Manila",
});

const timeFormat = new Intl.DateTimeFormat("en-PH", {
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

export function StudentUpcomingEventCard({
  result,
  semesterId,
}: {
  result: Promise<CardResult<{ highlight: UpcomingEventHighlight | null; totalUpcoming: number }>>;
  semesterId?: string;
}) {
  const { data, failed } = use(result);
  const highlight = data?.highlight ?? null;
  const totalUpcoming = data?.totalUpcoming ?? 0;
  const href = buildSemesterHref("/student/events", semesterId);
  const event = highlight?.event;
  const startTime = event?.time_in_from ? new Date(event.time_in_from) : null;

  const badge = highlight ? (
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
  ) : undefined;

  return (
    <DashboardSummaryCard
      title="Events & Attendance"
      icon={<CalendarDays className="size-5" />}
      iconClassName="bg-blue-500/10 text-blue-600 dark:text-blue-400"
      badge={badge}
      href={href}
      footerLabel="Browse all events & attendance claims"
      error={failed ? "Unable to load scheduled events. Tap below to inspect." : null}
    >
      {event ? (
        <div className="flex flex-col gap-1.5 min-w-0">
          <h4
            className="font-heading text-base font-semibold text-foreground leading-snug line-clamp-2 break-words"
            title={event.name}
          >
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
    </DashboardSummaryCard>
  );
}
