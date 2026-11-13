"use client";

import { useState } from "react";
import { Check, Copy, Eye, GraduationCap, Mail, RefreshCw, User, XCircle } from "lucide-react";

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
import { useClipboard } from "@/hooks/use-clipboard";
import { displayName, sortName } from "@/lib/format-name";
import type { StudentRosterItem } from "../contracts";
import { AcademicStatusBadge } from "./academic-status-badge";
import { InvitationStatusBadge } from "./invitation-status-badge";
import {
  CancelInvitationDialog,
  InviteStudentDialog,
} from "./student-invitation-dialogs";

export function StudentDetailDialog({
  student,
  canEdit = false,
}: {
  student: StudentRosterItem;
  canEdit?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [reissueOpen, setReissueOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const { copy, isCopied } = useClipboard();

  const fullDisplay = displayName(student);
  const fullSorted = sortName(student);

  const hasEmail = Boolean(student.email && student.email.trim() !== "");
  const isPending = student.invitation_state === "pending" && Boolean(student.pending_invitation_id);
  const isExpired = student.invitation_state === "expired";
  const isCancelled = student.invitation_state === "cancelled";

  const canInvite = (!student.invitation_state || isCancelled) && hasEmail;
  const canReissue = (isPending || isExpired) && hasEmail;

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
              title="View student details"
            >
              <Eye className="size-3.5" />
              <span>Details</span>
            </Button>
          }
        />
        <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-md">
          <DialogHeader className="text-left">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <GraduationCap className="size-4 text-primary" />
              <span>Student Profile & Directory Record</span>
            </div>
            <DialogTitle className="font-heading text-lg font-semibold text-foreground">
              {fullSorted}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Active academic enrollment and institutional identity details.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            {/* Identity Card */}
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/60 p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-medium text-muted-foreground">Student Number</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-primary">
                      {student.university_id}
                    </span>
                    <button
                      type="button"
                      onClick={() => copy(student.university_id, "id")}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Copy student number"
                    >
                      {isCopied("id") ? (
                        <Check className="size-3 text-emerald-600" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-[11px] font-medium text-muted-foreground">Account Status</span>
                  <InvitationStatusBadge student={student} size="sm" />
                </div>
              </div>

              {isPending && student.invitation_expires_at && (
                <div className="flex items-center justify-between rounded-lg bg-sky-50/70 p-2 text-[11px] text-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
                  <span>Invitation expires:</span>
                  <span className="font-medium">
                    {new Date(student.invitation_expires_at).toLocaleString("en-PH", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Asia/Manila",
                    })}
                  </span>
                </div>
              )}

              <div className="flex flex-col gap-0.5 border-t border-border/60 pt-2.5">
                <span className="text-[11px] font-medium text-muted-foreground">Full Name (Standard Order)</span>
                <div className="flex items-center gap-1.5">
                  <User className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs font-medium text-foreground">{fullDisplay}</span>
                </div>
              </div>

              <div className="flex flex-col gap-0.5 border-t border-border/60 pt-2.5">
                <span className="text-[11px] font-medium text-muted-foreground">Institutional Email</span>
                {student.email ? (
                  <div className="flex items-center justify-between gap-2">
                    <a
                      href={`mailto:${student.email}`}
                      className="flex items-center gap-1.5 truncate text-xs text-primary underline-offset-4 hover:underline"
                    >
                      <Mail className="size-3.5 shrink-0" />
                      <span className="truncate">{student.email}</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => copy(student.email!, "email")}
                      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Copy email address"
                    >
                      {isCopied("email") ? (
                        <Check className="size-3 text-emerald-600" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </button>
                  </div>
                ) : (
                  <span className="text-xs italic text-muted-foreground">No institutional email recorded</span>
                )}
              </div>
            </div>

            {/* Academic Enrollment Attributes */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="flex flex-col gap-1 rounded-lg border border-border bg-card/40 p-3">
                <span className="text-[11px] font-medium text-muted-foreground">Year Level</span>
                <span className="font-heading text-sm font-semibold text-foreground">
                  Year {student.year_level}
                </span>
              </div>

              <div className="flex flex-col gap-1 rounded-lg border border-border bg-card/40 p-3">
                <span className="text-[11px] font-medium text-muted-foreground">Academic Status</span>
                <div>
                  <AcademicStatusBadge status={student.academic_status} />
                </div>
              </div>
            </div>

            {/* Council Invitation Management Actions */}
            {canEdit && !student.has_account && (
              <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/30 p-3">
                <span className="text-[11px] font-medium text-muted-foreground">Account Access Management</span>
                <div className="flex flex-wrap gap-2">
                  {canInvite && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setInviteOpen(true)}
                      className="gap-1.5 text-xs"
                    >
                      <Mail className="size-3.5" />
                      <span>{isCancelled ? "Re-invite Student" : "Invite Student"}</span>
                    </Button>
                  )}

                  {canReissue && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setReissueOpen(true)}
                      className="gap-1.5 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      <RefreshCw className="size-3.5" />
                      <span>Reissue Invitation</span>
                    </Button>
                  )}

                  {isPending && (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => setCancelOpen(true)}
                      className="gap-1.5 text-xs"
                    >
                      <XCircle className="size-3.5" />
                      <span>Cancel Invitation</span>
                    </Button>
                  )}

                  {!hasEmail && (
                    <p className="text-[11px] text-muted-foreground italic">
                      Add an email address to this student profile before sending an invitation.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="w-full sm:w-auto"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
