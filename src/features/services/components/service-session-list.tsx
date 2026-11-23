"use client";

import { useId } from "react";
import Link from "next/link";
import {
  CalendarX,
  ChevronRight,
  Clock,
  MapPin,
  Plus,
  User,
} from "lucide-react";

import { RefreshButton } from "@/components/layout/refresh-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BucketBadge } from "@/features/discipline/components/disciplinary-badges";
import { cn } from "@/lib/utils";
import { extractTimeHHmmManila } from "../calculations";
import type { ServiceSessionSummary } from "../contracts";
import { SessionStatusBadge } from "./service-badges";

const MANILA_DATE_FORMATTER = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  dateStyle: "medium",
});

function formatDutyDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    const iso = dateStr.includes("T") ? dateStr : `${dateStr}T00:00:00+08:00`;
    return MANILA_DATE_FORMATTER.format(new Date(iso));
  } catch {
    return dateStr;
  }
}

export function ServiceSessionList({
  sessions,
  canCreate,
  isCurrentSemester,
  hasInstructorRole,
  showCreator = false,
  baseHref,
  renderedAt,
}: {
  sessions: ServiceSessionSummary[];
  canCreate: boolean;
  isCurrentSemester: boolean;
  hasInstructorRole: boolean;
  showCreator?: boolean;
  baseHref: string;
  renderedAt: string;
}) {
  const ineligibleReasonId = useId();

  const ineligibleReason = !isCurrentSemester
    ? "Service sessions can only be created in the current semester."
    : !hasInstructorRole
    ? "Only Academic Instructors and Clinical Instructors can create service sessions."
    : undefined;

  const createHref = baseHref.includes("?")
    ? `${baseHref}&create`
    : `${baseHref}?create`;

  const getDetailHref = (id: string) =>
    baseHref.includes("?")
      ? `${baseHref}&session=${id}`
      : `${baseHref}?session=${id}`;

  return (
    <div className="space-y-6">
      {/* Header with Title and Create Trigger */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
            Service Sessions
          </h2>
          <div className="mt-0.5 flex items-center gap-2">
            <p className="text-xs text-muted-foreground">
              {sessions.length}{" "}
              {sessions.length === 1 ? "service session" : "service sessions"}{" "}
              recorded
            </p>
            <RefreshButton renderedAt={renderedAt} />
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-1 max-sm:w-full sm:items-end">
          {canCreate ? (
            <Link
              href={createHref}
              className={cn(
                buttonVariants({ variant: "default", size: "sm" }),
                "gap-1.5 max-sm:min-h-11 max-sm:w-full"
              )}
            >
              <Plus className="size-4" />
              Create service session
            </Link>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                disabled
                aria-describedby={ineligibleReason ? ineligibleReasonId : undefined}
                className="gap-1.5 max-sm:min-h-11 max-sm:w-full"
              >
                <Plus className="size-4" />
                Create service session
              </Button>
              {ineligibleReason && (
                <p
                  id={ineligibleReasonId}
                  className="text-xs text-muted-foreground text-left sm:text-right"
                >
                  {ineligibleReason}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Sessions List or Empty State */}
      {sessions.length === 0 ? (
        <Card className="border border-border/70 border-dashed shadow-xs">
          <CardContent className="flex flex-col items-center justify-center p-8 text-center sm:p-12">
            <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <CalendarX className="size-6" />
            </div>
            <h3 className="text-base font-semibold text-foreground">
              No service sessions found
            </h3>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              {canCreate
                ? "No service sessions have been recorded for this semester yet. Create a service session to schedule duty hours and log student attendance."
                : "No service sessions have been recorded for this semester."}
            </p>
            {canCreate && (
              <div className="mt-4">
                <Link
                  href={createHref}
                  className={cn(
                    buttonVariants({ variant: "default", size: "sm" }),
                    "gap-1.5 max-sm:min-h-11"
                  )}
                >
                  <Plus className="size-4" />
                  Create service session
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {sessions.map((s) => {
            const detailHref = getDetailHref(s.id);
            const counts = s.participant_counts;
            const completedCount = counts.presentOnTime + counts.late;

            return (
              <Card
                key={s.id}
                className="border border-border/70 shadow-xs hover:border-border"
              >
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-heading text-base font-semibold text-foreground">
                        {formatDutyDate(s.duty_on)}
                      </span>
                      <BucketBadge bucket={s.bucket} />
                      <SessionStatusBadge endedAt={s.ended_at} />
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3.5 text-muted-foreground/70" />
                        <span>
                          {extractTimeHHmmManila(s.scheduled_start)} –{" "}
                          {extractTimeHHmmManila(s.scheduled_end)}
                        </span>
                      </span>

                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3.5 text-muted-foreground/70" />
                        <span>{s.location?.trim() || "No location specified"}</span>
                      </span>

                      {showCreator && s.creator_name && (
                        <span className="inline-flex items-center gap-1">
                          <User className="size-3.5 text-muted-foreground/70" />
                          <span>{s.creator_name}</span>
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {counts.total}{" "}
                        {counts.total === 1 ? "participant" : "participants"}
                      </span>
                      <span aria-hidden="true">•</span>
                      <span>{completedCount} completed</span>
                      {s.ended_at !== null ? (
                        <>
                          {typeof counts.creditCount === "number" && (
                            <>
                              <span aria-hidden="true">•</span>
                              <span className="font-medium text-emerald-700 dark:text-emerald-400">
                                {counts.creditCount} credit{counts.creditCount === 1 ? "" : "s"} issued
                              </span>
                            </>
                          )}
                          {typeof counts.zeroCreditCount === "number" && counts.zeroCreditCount > 0 && (
                            <>
                              <span aria-hidden="true">•</span>
                              <span>{counts.zeroCreditCount} retained (0 credit)</span>
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          {counts.inProgress > 0 && (
                            <>
                              <span aria-hidden="true">•</span>
                              <span className="font-medium text-amber-600 dark:text-amber-400">
                                {counts.inProgress} in progress
                              </span>
                            </>
                          )}
                        </>
                      )}
                      {counts.excluded > 0 && (
                        <>
                          <span aria-hidden="true">•</span>
                          <span className="text-muted-foreground/80">
                            {counts.excluded} excluded
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center pt-2 sm:pt-0">
                    <Link
                      href={detailHref}
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "gap-1 max-sm:min-h-11 max-sm:w-full"
                      )}
                    >
                      <span>Open session</span>
                      <ChevronRight className="size-4" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
