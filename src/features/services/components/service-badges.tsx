import { cn } from "@/lib/utils";

import { formatManilaDateTime } from "@/lib/manila-date";
import type { AttendanceStatus, ServiceParticipantCredit } from "../contracts";

/**
 * Badge indicating whether a service session is open or ended (finalized).
 */
export function SessionStatusBadge({
  endedAt,
  className,
}: {
  endedAt: string | null;
  className?: string;
}) {
  const isOpen = endedAt === null;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs",
        isOpen
          ? "border border-emerald-600/30 bg-emerald-50 font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "border border-border bg-muted font-medium text-muted-foreground",
        className
      )}
    >
      {isOpen && (
        <span
          className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400"
          aria-hidden="true"
        />
      )}
      {isOpen ? "Open" : "Ended"}
    </span>
  );
}

type StatusConfig = {
  label: string;
  className: string;
};

const ATTENDANCE_STATUS_CONFIG: Record<AttendanceStatus, StatusConfig> = {
  present_on_time: {
    label: "On Time",
    className:
      "border border-emerald-600/30 bg-emerald-50 font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  late: {
    label: "Late",
    className:
      "border border-amber-600/30 bg-amber-50 font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  },
  in_progress: {
    label: "In Progress",
    className:
      "border border-sky-600/30 bg-sky-50 font-medium text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  },
  missing_time_in: {
    label: "Missing Time-In",
    className:
      "border border-destructive/30 bg-destructive/10 font-medium text-destructive",
  },
  missing_time_out: {
    label: "Missing Time-Out",
    className:
      "border border-destructive/30 bg-destructive/10 font-medium text-destructive",
  },
  not_recorded: {
    label: "Not Recorded",
    className:
      "border border-border bg-muted font-medium text-muted-foreground",
  },
  excluded: {
    label: "Excluded",
    className:
      "border border-stone-300 bg-stone-100 font-medium text-stone-600 dark:border-stone-700 dark:bg-stone-900/60 dark:text-stone-400",
  },
};

/**
 * Badge indicating live participant attendance status within a service session.
 */
export function AttendanceStatusBadge({
  status,
  className,
}: {
  status: AttendanceStatus;
  className?: string;
}) {
  const config = ATTENDANCE_STATUS_CONFIG[status] ?? {
    label: status,
    className: "border border-border bg-muted font-medium text-muted-foreground",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs whitespace-nowrap",
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}

/**
 * Badge indicating post-finalization credit outcome for a participant.
 * - If revoked: muted/struck "1 Credit" alongside destructive "Credit Revoked" plus
 *   the recorded revocation reason and Asia/Manila revocation timestamp (FL-039, schema §10.3)
 * - If credit issued: "1 Credit" (positive emerald token)
 * - If completed with 0 credit: "Retained (0 Credit)" (neutral slate/muted token)
 * - Else (excluded/incomplete): muted "—"
 */
export function ParticipantCreditBadge({
  credit,
  status,
  className,
}: {
  credit?: ServiceParticipantCredit | null;
  status: AttendanceStatus;
  className?: string;
}) {
  if (credit?.revoked_at) {
    const trimmedReason = credit.revocation_reason?.trim();
    return (
      <div className={cn("flex min-w-0 flex-col items-start gap-1", className)}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground line-through whitespace-nowrap">
            1 Credit
          </span>
          <span className="inline-flex items-center rounded-full border border-rose-600/30 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 whitespace-nowrap">
            Credit Revoked
          </span>
        </div>
        <div className="max-w-xs whitespace-normal break-words rounded bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground space-y-1">
          {trimmedReason ? (
            <div>
              <strong className="font-medium text-foreground">Revocation note:</strong>{" "}
              {trimmedReason}
            </div>
          ) : null}
          {/* Server (Node ICU) and browser Intl output can differ in spacing. */}
          <div className="text-[10px] text-muted-foreground/80" suppressHydrationWarning>
            Revoked {formatManilaDateTime(credit.revoked_at)}
          </div>
        </div>
      </div>
    );
  }

  if (credit) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full border border-emerald-600/30 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 whitespace-nowrap",
          className
        )}
      >
        1 Credit
      </span>
    );
  }

  if (status === "present_on_time" || status === "late") {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground whitespace-nowrap",
          className
        )}
      >
        Retained (0 Credit)
      </span>
    );
  }

  return <span className={cn("text-muted-foreground", className)}>—</span>;
}

