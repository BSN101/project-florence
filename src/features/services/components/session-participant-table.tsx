"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, Clock, Loader2, RotateCcw, Users, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { displayName } from "@/lib/format-name";
import { cn } from "@/lib/utils";

import { setServiceParticipantsAction } from "../actions";
import {
  combineDateAndTimeManila,
  evaluateAttendanceStatus,
  extractTimeHHmmManila,
  isTimeWithinWindow,
} from "../calculations";
import type {
  AttendanceStatus,
  ServiceParticipantDetail,
  ServiceSessionRecord,
} from "../contracts";
import { setServiceParticipantsSchema } from "../schemas";
import { AttendanceStatusBadge } from "./service-badges";

type RowDraft = {
  timeInHHmm: string;
  timeOutHHmm: string;
  excluded: boolean;
};

function getTimeHHmm(iso: string | null | undefined): string {
  return iso ? extractTimeHHmmManila(iso) : "";
}

function getParticipantsSignature(list: ServiceParticipantDetail[]): string {
  return list
    .map(
      (p) =>
        `${p.student_id}:${p.time_in ?? ""}:${p.time_out ?? ""}:${p.excluded_at ?? ""}`
    )
    .join("|");
}

function initializeDrafts(list: ServiceParticipantDetail[]): Record<string, RowDraft> {
  const map: Record<string, RowDraft> = {};
  for (const p of list) {
    map[p.student_id] = {
      timeInHHmm: getTimeHHmm(p.time_in),
      timeOutHHmm: getTimeHHmm(p.time_out),
      excluded: Boolean(p.excluded_at),
    };
  }
  return map;
}

export function SessionParticipantTable({
  session,
  participants,
  canManage,
}: {
  session: ServiceSessionRecord;
  participants: ServiceParticipantDetail[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Signature-based prop sync preserving unsaved draft edits on other rows
  const currentSignature = getParticipantsSignature(participants);
  const [prevSignature, setPrevSignature] = useState(currentSignature);
  const [prevParticipantsList, setPrevParticipantsList] = useState(participants);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>(() =>
    initializeDrafts(participants)
  );

  if (currentSignature !== prevSignature) {
    setPrevSignature(currentSignature);
    setDrafts((prevDrafts) => {
      const next: Record<string, RowDraft> = {};
      const prevServerMap = new Map(
        prevParticipantsList.map((p) => [p.student_id, p])
      );
      for (const p of participants) {
        const prevServerP = prevServerMap.get(p.student_id);
        const existingDraft = prevDrafts[p.student_id];
        if (!existingDraft || !prevServerP) {
          next[p.student_id] = {
            timeInHHmm: getTimeHHmm(p.time_in),
            timeOutHHmm: getTimeHHmm(p.time_out),
            excluded: Boolean(p.excluded_at),
          };
        } else if (
          prevServerP.time_in !== p.time_in ||
          prevServerP.time_out !== p.time_out ||
          prevServerP.excluded_at !== p.excluded_at
        ) {
          next[p.student_id] = {
            timeInHHmm: getTimeHHmm(p.time_in),
            timeOutHHmm: getTimeHHmm(p.time_out),
            excluded: Boolean(p.excluded_at),
          };
        } else {
          next[p.student_id] = existingDraft;
        }
      }
      return next;
    });
    setPrevParticipantsList(participants);
  }

  // Idempotency and error state
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [retryableError, setRetryableError] = useState(false);

  // Identify rows modified compared to server state
  const dirtyRows = useMemo(() => {
    return participants.filter((p) => {
      const d = drafts[p.student_id];
      if (!d) return false;
      const origIn = getTimeHHmm(p.time_in);
      const origOut = getTimeHHmm(p.time_out);
      const origExcluded = Boolean(p.excluded_at);
      return (
        d.timeInHHmm !== origIn ||
        d.timeOutHHmm !== origOut ||
        d.excluded !== origExcluded
      );
    });
  }, [participants, drafts]);

  function updateDraft(studentId: string, patch: Partial<RowDraft>) {
    if (locked) return;
    setError(null);
    setSuccessNotice(null);
    setDrafts((prev) => {
      const current = prev[studentId] ?? {
        timeInHHmm: "",
        timeOutHHmm: "",
        excluded: false,
      };
      return {
        ...prev,
        [studentId]: {
          ...current,
          ...patch,
        },
      };
    });
  }

  function discardChanges() {
    if (locked) return;
    setError(null);
    setSuccessNotice(null);
    setDrafts(initializeDrafts(participants));
  }

  function startOver() {
    setLocked(false);
    setError(null);
    setRetryableError(false);
    setRequestKey(crypto.randomUUID());
  }

  function getPreviewStatus(
    p: ServiceParticipantDetail,
    d: RowDraft | undefined
  ): AttendanceStatus {
    if (!d) return p.status;
    if (d.excluded) return "excluded";

    const origIn = getTimeHHmm(p.time_in);
    const origOut = getTimeHHmm(p.time_out);
    const origExcluded = Boolean(p.excluded_at);

    // If times and exclusion are untouched, keep server-calculated status
    if (d.timeInHHmm === origIn && d.timeOutHHmm === origOut && !origExcluded) {
      return p.status;
    }

    const timeIn = d.timeInHHmm
      ? combineDateAndTimeManila(session.duty_on, d.timeInHHmm)
      : null;
    const timeOut = d.timeOutHHmm
      ? combineDateAndTimeManila(session.duty_on, d.timeOutHHmm)
      : null;

    return evaluateAttendanceStatus(
      {
        ...p,
        time_in: timeIn,
        time_out: timeOut,
        excluded_at: null,
      },
      session
    );
  }

  function handleSave() {
    if (dirtyRows.length === 0 || (locked && !retryableError)) return;

    setError(null);
    setSuccessNotice(null);

    const rowsPayload = dirtyRows.map((p) => {
      const d = drafts[p.student_id];
      return {
        studentId: p.student_id,
        timeIn: d.timeInHHmm
          ? combineDateAndTimeManila(session.duty_on, d.timeInHHmm)
          : null,
        timeOut: d.timeOutHHmm
          ? combineDateAndTimeManila(session.duty_on, d.timeOutHHmm)
          : null,
        excluded: d.excluded,
      };
    });

    // Client-side schema validation before sending
    const parsed = setServiceParticipantsSchema.safeParse({
      requestKey,
      sessionId: session.id,
      rows: rowsPayload,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check attendance inputs.");
      return;
    }

    const nowIso = new Date().toISOString();

    for (const p of dirtyRows) {
      const d = drafts[p.student_id];
      // Excluded rows keep their times and the database still validates them.
      if (!d) continue;

      const studentName = displayName(p);

      if (d.timeInHHmm) {
        const timeInIso = combineDateAndTimeManila(session.duty_on, d.timeInHHmm);
        if (!isTimeWithinWindow(timeInIso, session.time_in_from, session.time_in_until, nowIso)) {
          setError(
            `Time-in for ${studentName} (${d.timeInHHmm}) is outside the allowed check-in window (${extractTimeHHmmManila(session.time_in_from)} – ${extractTimeHHmmManila(session.time_in_until)}) or is in the future.`
          );
          return;
        }
      }

      if (d.timeOutHHmm) {
        const timeOutIso = combineDateAndTimeManila(session.duty_on, d.timeOutHHmm);
        if (!isTimeWithinWindow(timeOutIso, session.time_out_from, session.time_out_until, nowIso)) {
          setError(
            `Time-out for ${studentName} (${d.timeOutHHmm}) is outside the allowed check-out window (${extractTimeHHmmManila(session.time_out_from)} – ${extractTimeHHmmManila(session.time_out_until)}) or is in the future.`
          );
          return;
        }
      }
    }

    setLocked(true);

    startTransition(async () => {
      try {
        const res = await setServiceParticipantsAction(parsed.data);
        if (res && !res.success) {
          if (res.retryable) {
            setRetryableError(true);
            setError(res.error);
          } else {
            setLocked(false);
            setRetryableError(false);
            setRequestKey(crypto.randomUUID());
            setError(res.error);
            router.refresh();
          }
          return;
        }

        // On success:
        const count = res.updatedCount;
        setLocked(false);
        setRetryableError(false);
        setRequestKey(crypto.randomUUID());
        setSuccessNotice(
          `Saved attendance and exclusion settings for ${count} participant${count === 1 ? "" : "s"}.`
        );
        router.refresh();
      } catch (err) {
        if (
          err instanceof Error &&
          "digest" in err &&
          typeof (err as { digest?: unknown }).digest === "string" &&
          (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
        ) {
          throw err;
        }
        setRetryableError(true);
        setError("Unable to reach the server. Confirming again will not duplicate updates.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Attendance Window Bounds Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1.5">
            <Clock className="size-3.5 text-foreground" />
            <strong className="text-foreground font-medium">Check-In Window:</strong>{" "}
            {extractTimeHHmmManila(session.time_in_from)} –{" "}
            {extractTimeHHmmManila(session.time_in_until)} (Late after +
            {session.late_after_minutes}m)
          </span>
          <span className="hidden sm:inline" aria-hidden="true">
            •
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="size-3.5 text-foreground" />
            <strong className="text-foreground font-medium">Check-Out Window:</strong>{" "}
            {extractTimeHHmmManila(session.time_out_from)} –{" "}
            {extractTimeHHmmManila(session.time_out_until)}
          </span>
        </div>
      </div>

      {/* Notifications / Alerts */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successNotice && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-emerald-600/30 bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
        >
          <CheckCircle2 className="size-4 shrink-0" />
          <span>{successNotice}</span>
        </div>
      )}

      {/* Table Container */}
      <Card className="overflow-hidden">
        {participants.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-sm text-muted-foreground">
            <Users className="size-8 text-muted-foreground/50 mb-2" />
            <p className="font-medium text-foreground">No participants assigned yet</p>
            <p className="text-xs text-muted-foreground max-w-sm mt-1">
              {canManage
                ? "Click 'Add participants' above to assign enrolled students to this duty session."
                : "This service session has no participant attendance records."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b bg-muted/50 text-muted-foreground font-medium">
                  <th scope="col" className="px-3 py-2.5">
                    Student Number
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Student Name
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Year Level
                  </th>
                  <th scope="col" className="px-3 py-2.5">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-2.5 min-w-[190px]">
                    Time-In
                  </th>
                  <th scope="col" className="px-3 py-2.5 min-w-[190px]">
                    Time-Out
                  </th>
                  {canManage && (
                    <th scope="col" className="px-3 py-2.5 text-right">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {participants.map((p) => {
                  const d = drafts[p.student_id];
                  const previewStatus = getPreviewStatus(p, d);
                  const isExcluded = d?.excluded ?? Boolean(p.excluded_at);
                  const isRowDirty =
                    d &&
                    (d.timeInHHmm !== getTimeHHmm(p.time_in) ||
                      d.timeOutHHmm !== getTimeHHmm(p.time_out) ||
                      d.excluded !== Boolean(p.excluded_at));

                  return (
                    <tr
                      key={p.student_id}
                      className={cn(
                        isExcluded && "bg-muted/40 opacity-75",
                        isRowDirty && "bg-primary/[0.03]"
                      )}
                    >
                      {/* University ID */}
                      <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                        {p.university_id}
                      </td>

                      {/* Student Name */}
                      <td className="px-3 py-2.5 font-medium text-foreground whitespace-nowrap">
                        <span className={cn(isExcluded && "line-through text-muted-foreground")}>
                          {displayName(p)}
                        </span>
                      </td>

                      {/* Year Level */}
                      <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                        {p.year_level ? `Year ${p.year_level}` : "—"}
                      </td>

                      {/* Live Attendance Status */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <AttendanceStatusBadge status={previewStatus} />
                      </td>

                      {/* Time-In */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {canManage ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="time"
                              value={d?.timeInHHmm ?? ""}
                              disabled={isExcluded || locked}
                              onChange={(e) =>
                                updateDraft(p.student_id, { timeInHHmm: e.target.value })
                              }
                              className="h-7 w-32 text-xs px-2 py-0 tabular-nums max-sm:min-h-11"
                              aria-label={`Time-in for ${displayName(p)}`}
                            />
                            {!isExcluded && !locked && (
                              <div className="flex items-center gap-0.5">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="xs"
                                  onClick={() =>
                                    updateDraft(p.student_id, {
                                      timeInHHmm: extractTimeHHmmManila(new Date().toISOString()),
                                    })
                                  }
                                  className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground max-sm:min-h-11 max-sm:px-3"
                                  title="Stamp current time"
                                  aria-label={`Set time-in to now for ${displayName(p)}`}
                                >
                                  Now
                                </Button>
                                {d?.timeInHHmm && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="xs"
                                    onClick={() => updateDraft(p.student_id, { timeInHHmm: "" })}
                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive max-sm:min-h-11 max-sm:min-w-11"
                                    title="Clear time-in"
                                    aria-label={`Clear time-in for ${displayName(p)}`}
                                  >
                                    <X className="size-3" />
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="font-mono text-muted-foreground">
                            {getTimeHHmm(p.time_in) || "—"}
                          </span>
                        )}
                      </td>

                      {/* Time-Out */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {canManage ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="time"
                              value={d?.timeOutHHmm ?? ""}
                              disabled={isExcluded || locked}
                              onChange={(e) =>
                                updateDraft(p.student_id, { timeOutHHmm: e.target.value })
                              }
                              className="h-7 w-32 text-xs px-2 py-0 tabular-nums max-sm:min-h-11"
                              aria-label={`Time-out for ${displayName(p)}`}
                            />
                            {!isExcluded && !locked && (
                              <div className="flex items-center gap-0.5">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="xs"
                                  onClick={() =>
                                    updateDraft(p.student_id, {
                                      timeOutHHmm: extractTimeHHmmManila(new Date().toISOString()),
                                    })
                                  }
                                  className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground max-sm:min-h-11 max-sm:px-3"
                                  title="Stamp current time"
                                  aria-label={`Set time-out to now for ${displayName(p)}`}
                                >
                                  Now
                                </Button>
                                {d?.timeOutHHmm && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="xs"
                                    onClick={() => updateDraft(p.student_id, { timeOutHHmm: "" })}
                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive max-sm:min-h-11 max-sm:min-w-11"
                                    title="Clear time-out"
                                    aria-label={`Clear time-out for ${displayName(p)}`}
                                  >
                                    <X className="size-3" />
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="font-mono text-muted-foreground">
                            {getTimeHHmm(p.time_out) || "—"}
                          </span>
                        )}
                      </td>

                      {/* Actions (Exclude / Re-include) */}
                      {canManage && (
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          {isExcluded ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              disabled={locked}
                              onClick={() => updateDraft(p.student_id, { excluded: false })}
                              className="text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 max-sm:min-h-11"
                            >
                              Re-include
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="xs"
                              disabled={locked}
                              onClick={() => updateDraft(p.student_id, { excluded: true })}
                              className="text-muted-foreground hover:text-destructive max-sm:min-h-11"
                            >
                              Exclude
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Dirty Save Action Bar */}
      {dirtyRows.length > 0 && canManage && (
        <div className="sticky bottom-4 z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-primary/20 bg-background/95 p-3.5 shadow-lg backdrop-blur">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-medium text-foreground">
            <span className="size-2 rounded-full bg-primary shrink-0" aria-hidden="true" />
            <span>
              {dirtyRows.length} unsaved participant change{dirtyRows.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="flex items-center gap-2 justify-end">
            {retryableError ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={startOver}
                  className="max-sm:min-h-11"
                >
                  Start over
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={isPending}
                  onClick={handleSave}
                  className="max-sm:min-h-11 gap-1.5"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Retrying...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="size-4" /> Retry save
                    </>
                  )}
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={locked}
                  onClick={discardChanges}
                  className="max-sm:min-h-11"
                >
                  Discard changes
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={locked || isPending}
                  onClick={handleSave}
                  className="max-sm:min-h-11 gap-1.5"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Saving...
                    </>
                  ) : (
                    `Save attendance (${dirtyRows.length})`
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
