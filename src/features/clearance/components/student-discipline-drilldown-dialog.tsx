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
      <DialogContent className="max-h-[92vh] w-[calc(100%-1.5rem)] max-w-[calc(100%-1.5rem)] overflow-y-auto overflow-x-hidden p-4 sm:p-6 sm:max-w-4xl lg:max-w-5xl">
        <DialogHeader className="gap-1.5 text-left pb-2.5 border-b border-border/60 min-w-0 max-w-full pr-8 sm:pr-0">
          <DialogTitle className="font-heading text-base sm:text-xl font-semibold text-foreground flex items-center gap-2.5 min-w-0">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="size-4.5" />
            </div>
            <span className="leading-snug break-words">Disciplinary Ledger & Obligations</span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-muted-foreground leading-relaxed break-words">
            Complete disciplinary records, merits, demerits, and service credits for{" "}
            <span className="font-semibold text-foreground">{studentName ?? "Student"}</span>
            {studentNumber && (
              <span className="font-mono text-muted-foreground"> ({studentNumber})</span>
            )}
            .
          </DialogDescription>
        </DialogHeader>

        <div className="pt-3 pb-1 min-w-0 max-w-full overflow-hidden">
          <FacultyStudentDisciplinaryPanel studentId={studentId} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
