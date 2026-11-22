import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Info,
  MapPin,
  User,
  Users,
} from "lucide-react";

import { RefreshButton } from "@/components/layout/refresh-button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BucketBadge } from "@/features/discipline/components/disciplinary-badges";
import { cn } from "@/lib/utils";
import { extractTimeHHmmManila } from "../calculations";
import type {
  AvailableServiceStudent,
  ServiceSessionDetail as ServiceSessionDetailType,
} from "../contracts";
import { AddParticipantsDialog } from "./add-participants-dialog";
import { SessionStatusBadge } from "./service-badges";
import { SessionParticipantTable } from "./session-participant-table";

const MANILA_DATE_FORMATTER = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  dateStyle: "medium",
});

const MANILA_DATETIME_FORMATTER = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  dateStyle: "medium",
  timeStyle: "short",
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

function formatManilaDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return MANILA_DATETIME_FORMATTER.format(new Date(iso));
  } catch {
    return "—";
  }
}

function getReadOnlyReason(
  endedAt: string | null,
  isCurrentSemester: boolean,
  isOwner: boolean
): string {
  if (endedAt !== null) {
    return "This service session has ended. Participant attendance records are locked and read-only.";
  }
  if (!isCurrentSemester) {
    return "You are viewing a past semester. Service session attendance cannot be edited.";
  }
  if (!isOwner) {
    return "Only the instructor who created this service session can manage participants and edit attendance.";
  }
  return "Attendance records for this service session are currently read-only.";
}

export function ServiceSessionDetail({
  session,
  availableStudents,
  studentsLoadFailed,
  renderedAt,
  canManage,
  isOwner,
  isCurrentSemester,
  listHref,
}: {
  session: ServiceSessionDetailType;
  availableStudents: AvailableServiceStudent[];
  studentsLoadFailed: boolean;
  renderedAt: string;
  canManage: boolean;
  isOwner: boolean;
  isCurrentSemester: boolean;
  listHref: string;
}) {
  const counts = session.participant_counts;
  const completedTotal = counts.presentOnTime + counts.late;
  const pendingTotal = counts.inProgress + counts.notRecorded;
  const missingTotal = counts.missingTimeIn + counts.missingTimeOut;

  return (
    <div className="space-y-6">
      {/* Navigation & Session Metadata Header */}
      <div className="flex flex-col gap-3">
        <Link
          href={listHref}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "w-fit gap-1 max-sm:min-h-11"
          )}
        >
          <ArrowLeft className="size-4" />
          Back to service sessions
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                {formatDutyDate(session.duty_on)}
              </h1>
              <BucketBadge bucket={session.bucket} />
              <SessionStatusBadge endedAt={session.ended_at} />
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-3.5 text-muted-foreground/70" />
                <span>
                  {extractTimeHHmmManila(session.scheduled_start)} –{" "}
                  {extractTimeHHmmManila(session.scheduled_end)}
                  <span className="ml-1 text-muted-foreground/60">
                    ({session.late_after_minutes}m late grace)
                  </span>
                </span>
              </span>

              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5 text-muted-foreground/70" />
                <span>{session.location?.trim() || "No location specified"}</span>
              </span>

              <span className="inline-flex items-center gap-1.5">
                <User className="size-3.5 text-muted-foreground/70" />
                <span>{session.creator_name || "Unknown instructor"}</span>
              </span>

              {session.ended_at ? (
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5 text-muted-foreground/70" />
                  <span>Finalized {formatManilaDateTime(session.ended_at)}</span>
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <RefreshButton renderedAt={renderedAt} />
            {canManage ? (
              <AddParticipantsDialog
                sessionId={session.id}
                availableStudents={availableStudents}
                loadFailed={studentsLoadFailed}
              />
            ) : null}
          </div>
        </div>
      </div>

      {/* Contextual Read-Only Banner */}
      {!canManage && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-lg border border-border/80 bg-muted/40 p-3 text-xs text-muted-foreground"
        >
          <Info className="size-4 shrink-0 text-muted-foreground mt-0.5" />
          <span>{getReadOnlyReason(session.ended_at, isCurrentSemester, isOwner)}</span>
        </div>
      )}

      {/* Summary Metric Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {/* Card 1: Total Participants */}
        <Card className="border border-border/70 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Participants
            </CardTitle>
            <Users className="size-4 text-muted-foreground/70" />
          </CardHeader>
          <CardContent>
            <div className="font-heading text-2xl font-semibold tracking-tight tabular-nums text-foreground">
              {counts.total}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {counts.total} total · {counts.excluded} excluded
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Completed */}
        <Card className="border border-border/70 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Completed
            </CardTitle>
            <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="font-heading text-2xl font-semibold tracking-tight tabular-nums text-foreground">
              {completedTotal}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {counts.presentOnTime} on time · {counts.late} late
            </p>
          </CardContent>
        </Card>

        {/* Card 3: In Progress / Pending */}
        <Card className="border border-border/70 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              In Progress / Pending
            </CardTitle>
            <Clock className="size-4 text-amber-600 dark:text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="font-heading text-2xl font-semibold tracking-tight tabular-nums text-foreground">
              {pendingTotal}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {counts.inProgress} in progress · {counts.notRecorded} not recorded
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Missing Timestamps */}
        <Card className="border border-border/70 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Missing Timestamps
            </CardTitle>
            <AlertTriangle className="size-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="font-heading text-2xl font-semibold tracking-tight tabular-nums text-foreground">
              {missingTotal}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {counts.missingTimeIn} missing in · {counts.missingTimeOut} missing out
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Participant Roster Section */}
      <section className="space-y-3" aria-labelledby="participant-roster-heading">
        <div className="flex items-center justify-between">
          <h2
            id="participant-roster-heading"
            className="text-sm font-semibold tracking-tight text-foreground"
          >
            Participant Roster & Attendance
          </h2>
          <span className="text-xs text-muted-foreground">
            {session.participants.length}{" "}
            {session.participants.length === 1 ? "participant" : "participants"}
          </span>
        </div>
        <SessionParticipantTable
          session={session}
          participants={session.participants}
          canManage={canManage}
        />
      </section>
    </div>
  );
}
