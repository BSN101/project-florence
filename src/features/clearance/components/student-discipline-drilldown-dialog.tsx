"use client";

import { FileText } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FacultyStudentDisciplinaryPanel } from "@/features/discipline/components/faculty-student-disciplinary-panel";

export function StudentDisciplineDrilldownDialog({
  studentId,
  studentName,
  studentNumber,
  isOpen,
  onClose,
}: {
  studentId: string | null;
  studentName: string | null;
  studentNumber: string | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!studentId) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] w-[calc(100%-1.5rem)] overflow-y-auto sm:max-w-4xl lg:max-w-5xl p-4 sm:p-6">
        <DialogHeader className="gap-1.5 text-left pb-2 border-b border-border/60">
          <DialogTitle className="font-heading text-lg sm:text-xl font-semibold text-foreground flex items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="size-4.5" />
            </div>
            <span>Disciplinary Ledger & Obligations</span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Complete disciplinary records, merits, demerits, and service credits for{" "}
            <span className="font-semibold text-foreground">{studentName ?? "Student"}</span>
            {studentNumber && (
              <span className="font-mono text-muted-foreground"> ({studentNumber})</span>
            )}
            .
          </DialogDescription>
        </DialogHeader>

        <div className="pt-3 pb-1">
          <FacultyStudentDisciplinaryPanel studentId={studentId} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
