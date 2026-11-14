"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  Loader2,
  Mail,
  Send,
  UserCheck,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { bulkInviteStudentsDirectAction } from "../actions";
import {
  BULK_INVITE_BATCH_SIZE,
  countBulkOutcomes,
  getInvitationEligibilitySummary,
  type BulkInviteOutcome,
  type StudentRosterItem,
} from "../contracts";
import { ProgressBar } from "./progress-bar";
import { StudentRowActions } from "./student-invitation-dialogs";


type Stage = "review" | "sending" | "done";
type Run = {
  outcomes: BulkInviteOutcome[];
  remaining: number;
  batches: number;
  elapsedMs: number;
  stopped: boolean;
  error?: string;
};

const emptyRun: Run = { outcomes: [], remaining: 0, batches: 0, elapsedMs: 0, stopped: false };

function formatEstimate(ms: number) {
  if (ms < 60_000) return "Less than a minute left";
  const minutes = Math.round(ms / 60_000);
  return `About ${minutes} min left`;
}

export function BulkInviteDialog({
  semesterId,
  students,
  className,
  open: controlledOpen,
  onOpenChange,
}: {
  semesterId: string;
  students: StudentRosterItem[];
  className?: string;
  /** Pass to open it from elsewhere (the import dialog); the trigger button is then not rendered. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [stage, setStage] = useState<Stage>("review");
  const [run, setRun] = useState<Run>(emptyRun);
  const stopRequested = useRef(false); // read inside the running loop
  const [stopping, setStopping] = useState(false); // drives the button label

  const summary = useMemo(() => getInvitationEligibilitySummary(students), [students]);
  const ineligibleCount =
    summary.alreadyRegisteredCount +
    summary.pendingCount +
    summary.missingEmailCount +
    summary.archivedCount;

  const counts = countBulkOutcomes(run.outcomes);
  const processed = run.outcomes.length;
  const total = processed + run.remaining;
  const percent = total === 0 ? 0 : Math.round((processed / total) * 100);
  // Students in the request that hasn't returned yet; drawn as a pulsing segment so the bar never looks frozen.
  const inFlight = stage === "sending" ? Math.min(BULK_INVITE_BATCH_SIZE, run.remaining) : 0;
  const needsAttention = run.outcomes.filter((o) => o.status === "failed" || o.status === "email_failed");
  const estimateMs = run.batches === 0 ? null : (run.elapsedMs / run.batches) * Math.ceil(run.remaining / BULK_INVITE_BATCH_SIZE);

  const handleOpenChange = (next: boolean) => {
    if (stage === "sending") return; // closing mid-run would hide progress; use "Stop after this batch"
    if (!next) {
      setStage("review");
      setRun(emptyRun);
    }
    setOpen(next);
  };

  const handleSend = async () => {
    stopRequested.current = false;
    setStopping(false);
    const started = Date.now();
    // Every student handled in this run, whatever the outcome. A failed email makes a student eligible
    // again, so without this the same run would resend to them in every later batch.
    const handledIds: string[] = [];
    let current: Run = { ...emptyRun, remaining: summary.eligibleCount };
    setRun(current);
    setStage("sending");

    for (;;) {
      let res;
      try {
        res = await bulkInviteStudentsDirectAction(semesterId, handledIds);
      } catch {
        // A dropped connection must not leave the dialog locked in "sending".
        res = { success: false as const, error: "The connection was interrupted." };
      }
      if (!res.success) {
        current = { ...current, error: res.error };
        break;
      }
      for (const o of res.outcomes) handledIds.push(o.studentId);
      current = {
        ...current,
        outcomes: [...current.outcomes, ...res.outcomes],
        remaining: res.remaining,
        batches: current.batches + 1,
        elapsedMs: Date.now() - started,
      };
      setRun(current);
      // An empty batch means nothing is left that this run can process.
      if (res.remaining === 0 || res.outcomes.length === 0) break;
      if (stopRequested.current) {
        current = { ...current, stopped: true };
        break;
      }
    }

    setRun(current);
    setStage("done");
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {controlledOpen === undefined && <DialogTrigger
        render={
          <Button
            variant="outline"
            className={cn("gap-2 font-medium text-xs sm:text-sm", className)}
            disabled={students.length === 0}
            title="Send invitations to all uninvited students with valid emails"
          >
            <Send className="size-4 text-primary" />
            <span>Invite Uninvited Students</span>
            {summary.eligibleCount > 0 && (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.2 text-[11px] font-semibold text-primary">
                {summary.eligibleCount}
              </span>
            )}
          </Button>
        }
      />}
      <DialogContent
        className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-md"
        showCloseButton={stage !== "sending"}
      >
        <DialogHeader className="text-left">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Users className="size-4 text-primary" />
            <span>Council Batch Provisioning</span>
          </div>
          <DialogTitle className="font-heading text-lg font-semibold text-foreground">
            {stage === "review" && `Invite ${summary.eligibleCount} students`}
            {stage === "sending" && "Sending invitations…"}
            {stage === "done" && (run.stopped ? "Sending stopped" : "Invitations finished")}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {stage === "review" &&
              `Invitations go out in batches of ${BULK_INVITE_BATCH_SIZE}. Keep this window open until sending finishes.`}
            {stage === "sending" && "Keep this window open. Invitations already sent stay sent if you stop."}
            {stage === "done" && "Students with a sent invitation now show as pending in the roster."}
          </DialogDescription>
        </DialogHeader>

        {stage === "review" && (
          <div className="flex flex-col gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1 rounded-xl border border-primary/30 bg-primary/5 p-3.5">
                <span className="text-[11px] font-medium text-primary">Eligible to Invite</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-heading text-2xl font-bold text-foreground">{summary.eligibleCount}</span>
                  <span className="text-xs text-muted-foreground">students</span>
                </div>
                <span className="text-[11px] text-muted-foreground">Uninvited with institutional email</span>
              </div>

              <div className="flex flex-col gap-1 rounded-xl border border-border bg-muted/40 p-3.5">
                <span className="text-[11px] font-medium text-muted-foreground">Ineligible / Skip</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-heading text-2xl font-bold text-foreground">{ineligibleCount}</span>
                  <span className="text-xs text-muted-foreground">students</span>
                </div>
                <span className="text-[11px] text-muted-foreground">Active account, pending, or no email</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 rounded-xl border border-border bg-card/60 p-3.5 text-xs">
              <span className="font-medium text-foreground">Eligibility Breakdown</span>
              <ul className="flex flex-col gap-1.5 text-muted-foreground">
                <li className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="size-3.5 text-emerald-600" />
                    <span>Eligible uninvited students:</span>
                  </span>
                  <strong className="font-semibold text-foreground">{summary.eligibleCount}</strong>
                </li>
                {summary.resendCount > 0 && (
                  <li className="flex items-center justify-between pl-5">
                    <span className="flex items-center gap-1.5">
                      <AlertCircle className="size-3.5 text-amber-600" />
                      <span>Of these, email not delivered (fresh link):</span>
                    </span>
                    <span className="font-medium text-foreground">{summary.resendCount}</span>
                  </li>
                )}
                <li className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <UserCheck className="size-3.5 text-muted-foreground" />
                    <span>Already have an active account:</span>
                  </span>
                  <span className="font-medium text-foreground">{summary.alreadyRegisteredCount}</span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Mail className="size-3.5 text-muted-foreground" />
                    <span>Pending invitation already sent:</span>
                  </span>
                  <span className="font-medium text-foreground">{summary.pendingCount}</span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <HelpCircle className="size-3.5 text-amber-600" />
                    <span>Missing email address:</span>
                  </span>
                  <span className="font-medium text-foreground">{summary.missingEmailCount}</span>
                </li>
              </ul>
            </div>

            <div className="rounded-lg bg-muted/40 p-3 text-[11px] text-muted-foreground">
              <strong className="font-medium text-foreground">Notice:</strong> Roster enrollment and invitation
              delivery have separate outcomes. If SMTP delivery fails for any recipient, their student roster record
              remains untouched.
            </div>
          </div>
        )}

        {stage !== "review" && (
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-medium text-foreground">
                  {processed} of {total} processed
                </span>
                <span className="text-muted-foreground">{percent}%</span>
              </div>
              <ProgressBar
                value={processed}
                max={total}
                pending={inFlight}
                label="Invitations processed"
                tone={stage === "done" && !run.error ? "success" : "primary"}
              />
              {stage === "sending" && (
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  Sending {inFlight} now · Batch {run.batches + 1} of {run.batches + Math.max(1, Math.ceil(run.remaining / BULK_INVITE_BATCH_SIZE))}
                  {estimateMs !== null && ` · ${formatEstimate(estimateMs)}`}
                </span>
              )}
            </div>

            <div aria-live="polite" className="flex flex-wrap gap-2 text-[11px]">
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300">
                ✓ {counts.sent} sent
              </span>
              {counts.email_failed > 0 && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800 dark:bg-amber-900/60 dark:text-amber-300">
                  ⚠ {counts.email_failed} email not delivered
                </span>
              )}
              {counts.failed > 0 && (
                <span className="rounded bg-destructive/15 px-1.5 py-0.5 font-medium text-destructive">
                  ✕ {counts.failed} not created
                </span>
              )}
              {counts.skipped > 0 && (
                <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-muted-foreground">
                  {counts.skipped} already sent by another officer
                </span>
              )}
            </div>

            {run.error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{run.error} Invitations already sent stay sent; run the bulk invite again to continue.</span>
              </div>
            )}

            {stage === "done" && run.stopped && run.remaining > 0 && (
              <p className="text-xs text-muted-foreground">
                {run.remaining} student(s) were not processed. Run the bulk invite again to continue.
              </p>
            )}

            {stage === "done" && needsAttention.length > 0 && (
              <div className="flex flex-col gap-2 rounded-xl border border-amber-600/30 bg-amber-50/60 p-3.5 text-xs dark:bg-amber-950/30">
                <span className="font-medium text-foreground">{needsAttention.length} need attention</span>
                <ul className="flex flex-col gap-2">
                  {needsAttention.map((o) => {
                    const student = students.find((s) => s.student_id === o.studentId);
                    return (
                      <li key={o.studentId} className="flex items-center justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-foreground">{o.name}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {o.reason ?? "Something went wrong."}
                          </span>
                        </span>
                        {student && <StudentRowActions student={student} canEdit />}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {stage === "review" && (
            <>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} className="w-full sm:w-auto">
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSend}
                disabled={summary.eligibleCount === 0}
                className="w-full gap-2 sm:w-auto"
              >
                <Send className="size-4" />
                <span>Send {summary.eligibleCount} invitations</span>
              </Button>
            </>
          )}
          {stage === "sending" && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                stopRequested.current = true;
                setStopping(true);
              }}
              disabled={stopping}
              className="w-full sm:w-auto"
            >
              {stopping ? "Stopping after this batch…" : "Stop after this batch"}
            </Button>
          )}
          {stage === "done" && (
            <Button type="button" onClick={() => handleOpenChange(false)} className="w-full sm:w-auto">
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
