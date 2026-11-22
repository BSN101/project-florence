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
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader className="gap-1 text-left">
          <DialogTitle className="font-heading text-lg font-medium text-foreground flex items-center gap-2">
            <FileText className="size-4.5 text-primary" />
            Disciplinary Ledger & Obligations
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Complete disciplinary records, merits, demerits, and service credits for{" "}
            <span className="font-medium text-foreground">{studentName ?? "Student"}</span>
            {studentNumber && (
              <span className="font-mono text-muted-foreground"> ({studentNumber})</span>
            )}
            .
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <FacultyStudentDisciplinaryPanel studentId={studentId} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
