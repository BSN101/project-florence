"use client";

import { useState } from "react";
import { Check, Copy, Eye, GraduationCap, Mail, User } from "lucide-react";

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
import { EditStudentDialog } from "./edit-student-dialog";

export function StudentDetailDialog({
  student,
  canEdit = false,
  trigger,
}: {
  student: StudentRosterItem;
  canEdit?: boolean;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { copy, isCopied } = useClipboard();

  const fullDisplay = displayName(student);
  const fullSorted = sortName(student);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ? (
            <>{trigger}</>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
              title="View student details"
            >
              <Eye className="size-3.5" />
              <span>Details</span>
            </Button>
          )
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
                {student.has_account ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-600/30 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <span className="size-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                    Active (Linked)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    <span className="size-1.5 rounded-full bg-current" />
                    Uninvited / Pending
                  </span>
                )}
              </div>
            </div>

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
          {canEdit && (
            <div onClick={() => setOpen(false)}>
              <EditStudentDialog
                student={student}
                trigger={
                  <Button className="w-full gap-2 sm:w-auto">
                    Edit Student
                  </Button>
                }
              />
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
