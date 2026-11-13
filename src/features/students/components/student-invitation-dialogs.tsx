"use client";

import { useState, useTransition } from "react";
import { AlertCircle, AlertTriangle, Check, Loader2, Mail, RefreshCw, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { displayName } from "@/lib/format-name";

import {
  cancelStudentInvitationDirectAction,
  inviteStudentDirectAction,
} from "../actions";
import type { StudentActionResult, StudentRosterItem } from "../contracts";

export function InviteStudentDialog({
  student,
  open,
  onOpenChange,
  isReissue = false,
}: {
  student: StudentRosterItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isReissue?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<StudentActionResult | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (!isPending) {
      if (!next) setResult(null);
      onOpenChange(next);
    }
  };

  const handleInvite = () => {
    startTransition(async () => {
      const res = await inviteStudentDirectAction(student.student_id);
      setResult(res);
    });
  };

  const fullName = displayName(student);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader className="text-left">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            {isReissue ? <RefreshCw className="size-4 text-primary" /> : <Mail className="size-4 text-primary" />}
            <span>Council Student Provisioning</span>
          </div>
          <DialogTitle className="font-heading text-lg font-semibold text-foreground">
            {isReissue ? "Reissue Student Invitation" : "Invite Student"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {isReissue
              ? `Send a new Florence invitation link to ${fullName}. Any prior invitation token will be closed.`
              : `Send an official invitation link to ${fullName} so they can activate their student account.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-card/60 p-3.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Student:</span>
              <span className="font-medium text-foreground">{fullName} ({student.university_id})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email Destination:</span>
              <span className="font-mono font-medium text-primary break-all">{student.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Enrollment:</span>
              <span className="font-medium text-foreground">Year {student.year_level} ({student.academic_status})</span>
            </div>
          </div>

          {result && (
            <div
              className={`flex items-start gap-2 rounded-lg p-3 text-xs ${
                result.success
                  ? "border border-emerald-600/30 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                  : "border border-destructive/30 bg-destructive/10 text-destructive"
              }`}
            >
              {result.success ? (
                <Check className="size-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="size-4 shrink-0 text-destructive" />
              )}
              <span>{result.success ? result.message : result.error}</span>
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
              onClick={handleInvite}
              disabled={isPending}
              className="w-full sm:w-auto gap-2"
            >
              {isPending && <Loader2 className="size-4 animate-spin" />}
              {isReissue ? "Reissue Invitation" : "Send Invitation"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CancelInvitationDialog({
  student,
  open,
  onOpenChange,
}: {
  student: StudentRosterItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<StudentActionResult | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (!isPending) {
      if (!next) setResult(null);
      onOpenChange(next);
    }
  };

  const handleCancel = () => {
    if (!student.pending_invitation_id) return;
    startTransition(async () => {
      const res = await cancelStudentInvitationDirectAction(student.pending_invitation_id!);
      setResult(res);
    });
  };

  const fullName = displayName(student);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader className="text-left">
          <div className="flex items-center gap-2 text-xs font-medium text-destructive">
            <AlertTriangle className="size-4" />
            <span>Cancel Pending Invitation</span>
          </div>
          <DialogTitle className="font-heading text-lg font-semibold text-destructive">
            Cancel this invitation?
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            The link sent to <strong className="text-foreground">{student.email}</strong> will stop working immediately. The student's roster enrollment remains active and you can reissue later.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-3.5 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Student:</span>
              <span className="font-medium text-foreground">{fullName} ({student.university_id})</span>
            </div>
            {student.invitation_expires_at && (
              <div className="flex justify-between">
                <span>Expires At:</span>
                <span className="font-medium text-foreground">
                  {new Date(student.invitation_expires_at).toLocaleString("en-PH", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Asia/Manila",
                  })}
                </span>
              </div>
            )}
          </div>

          {result && (
            <div
              className={`flex items-start gap-2 rounded-lg p-3 text-xs ${
                result.success
                  ? "border border-emerald-600/30 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                  : "border border-destructive/30 bg-destructive/10 text-destructive"
              }`}
            >
              {result.success ? (
                <Check className="size-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="size-4 shrink-0 text-destructive" />
              )}
              <span>{result.success ? result.message : result.error}</span>
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
            {result?.success ? "Done" : "Keep Invitation"}
          </Button>
          {!result?.success && (
            <Button
              type="button"
              variant="destructive"
              onClick={handleCancel}
              disabled={isPending}
              className="w-full sm:w-auto gap-2"
            >
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Cancel Invitation
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StudentRowActions({
  student,
  canEdit,
}: {
  student: StudentRosterItem;
  canEdit: boolean;
}) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [reissueOpen, setReissueOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  if (!canEdit || student.has_account) return null;

  const hasEmail = Boolean(student.email && student.email.trim() !== "");
  const isPending = student.invitation_state === "pending" && Boolean(student.pending_invitation_id);
  const isExpired = student.invitation_state === "expired";
  const isCancelled = student.invitation_state === "cancelled";

  // When uninvited or cancelled, the student can receive a fresh invitation.
  const canInvite = (!student.invitation_state || isCancelled) && hasEmail;
  // When pending or expired, Council can reissue to resend a fresh link and close previous.
  const canReissue = (isPending || isExpired) && hasEmail;

  return (
    <>
      <div className="flex items-center gap-1">
        {canInvite && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setInviteOpen(true)}
            className="h-8 gap-1 px-2 text-xs font-medium text-primary hover:bg-primary/10 hover:text-primary"
            title={isCancelled ? "Re-invite student" : "Invite student"}
          >
            <Mail className="size-3.5" />
            <span className="hidden sm:inline">{isCancelled ? "Re-invite" : "Invite"}</span>
          </Button>
        )}

        {canReissue && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setReissueOpen(true)}
            className="h-8 gap-1 px-2 text-xs font-medium text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/40"
            title="Reissue invitation link"
          >
            <RefreshCw className="size-3.5" />
            <span className="hidden sm:inline">Reissue</span>
          </Button>
        )}

        {isPending && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCancelOpen(true)}
            className="h-8 gap-1 px-2 text-xs font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
            title="Cancel pending invitation"
          >
            <XCircle className="size-3.5" />
            <span className="hidden sm:inline">Cancel</span>
          </Button>
        )}
      </div>

      <InviteStudentDialog
        student={student}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        isReissue={false}
      />

      <InviteStudentDialog
        student={student}
        open={reissueOpen}
        onOpenChange={setReissueOpen}
        isReissue={true}
      />

      <CancelInvitationDialog
        student={student}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
      />
    </>
  );
}
