"use client";

import { useMemo, useState, useTransition } from "react";
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
  getInvitationEligibilitySummary,
  type BulkInviteResult,
  type StudentRosterItem,
} from "../contracts";

export function BulkInviteDialog({
  semesterId,
  students,
  className,
}: {
  semesterId: string;
  students: StudentRosterItem[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<BulkInviteResult | null>(null);

  const summary = useMemo(() => getInvitationEligibilitySummary(students), [students]);
  const ineligibleCount =
    summary.alreadyRegisteredCount +
    summary.pendingCount +
    summary.missingEmailCount +
    summary.archivedCount;

  const handleOpenChange = (next: boolean) => {
    if (!isPending) {
      if (!next) setResult(null);
      setOpen(next);
    }
  };

  const handleBulkInvite = () => {
    startTransition(async () => {
      const res = await bulkInviteStudentsDirectAction(semesterId);
      setResult(res);
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
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
      />
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader className="text-left">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Users className="size-4 text-primary" />
            <span>Council Batch Provisioning</span>
          </div>
          <DialogTitle className="font-heading text-lg font-semibold text-foreground">
            Invite Uninvited Students
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Send account creation invitations to all enrolled students who do not yet have an active account or pending invitation.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Eligibility Overview Metrics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1 rounded-xl border border-primary/30 bg-primary/5 p-3.5">
              <span className="text-[11px] font-medium text-primary">Eligible to Invite</span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-heading text-2xl font-bold text-foreground">
                  {summary.eligibleCount}
                </span>
                <span className="text-xs text-muted-foreground">students</span>
              </div>
              <span className="text-[11px] text-muted-foreground">
                Uninvited with institutional email
              </span>
            </div>

            <div className="flex flex-col gap-1 rounded-xl border border-border bg-muted/40 p-3.5">
              <span className="text-[11px] font-medium text-muted-foreground">Ineligible / Skip</span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-heading text-2xl font-bold text-foreground">
                  {ineligibleCount}
                </span>
                <span className="text-xs text-muted-foreground">students</span>
              </div>
              <span className="text-[11px] text-muted-foreground">
                Active account, pending, or no email
              </span>
            </div>
          </div>

          {/* Detailed Breakdown */}
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

          {/* Delivery Note */}
          <div className="rounded-lg bg-muted/40 p-3 text-[11px] text-muted-foreground">
            <strong className="font-medium text-foreground">Notice:</strong> Roster enrollment and invitation delivery have separate outcomes. If SMTP delivery fails for any recipient, their student roster record remains untouched.
          </div>

          {/* Execution Result Notification */}
          {result && (
            <div
              className={`flex flex-col gap-1.5 rounded-lg p-3 text-xs ${
                result.success
                  ? "border border-emerald-600/30 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-200"
                  : "border border-destructive/30 bg-destructive/10 text-destructive"
              }`}
            >
              <div className="flex items-center gap-2 font-medium">
                {result.success ? (
                  <CheckCircle2 className="size-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="size-4 text-destructive" />
                )}
                <span>{result.success ? "Batch invitations completed" : "Operation Failed"}</span>
              </div>
              <p className="pl-6 text-[11px] leading-relaxed">
                {result.success ? result.message : result.error}
              </p>
              {result.success && result.invitedCount !== undefined && (
                <div className="mt-1 flex flex-wrap gap-2 pl-6 text-[11px]">
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300">
                    Created: {result.invitedCount}
                  </span>
                  {result.emailFailedCount !== undefined && result.emailFailedCount > 0 && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800 dark:bg-amber-900/60 dark:text-amber-300">
                      Email delivery skipped/failed: {result.emailFailedCount}
                    </span>
                  )}
                  {result.failedCount !== undefined && result.failedCount > 0 && (
                    <span className="rounded bg-destructive/15 px-1.5 py-0.5 font-medium text-destructive">
                      Database errors: {result.failedCount}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
            className="w-full sm:w-auto"
          >
            {result?.success ? "Done" : "Cancel"}
          </Button>
          {!result?.success && (
            <Button
              type="button"
              onClick={handleBulkInvite}
              disabled={isPending || summary.eligibleCount === 0}
              className="w-full sm:w-auto gap-2"
            >
              {isPending && <Loader2 className="size-4 animate-spin" />}
              <span>{isPending ? "Sending Invitations..." : `Invite ${summary.eligibleCount} Students`}</span>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
