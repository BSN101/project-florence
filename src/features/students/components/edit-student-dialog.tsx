"use client";

import { useActionState, useState } from "react";
import { Loader2, Pencil } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateStudentAction } from "../actions";
import type { StudentActionResult, StudentRosterItem } from "../contracts";

export function EditStudentDialog({
  student,
  activeSemesterId,
}: {
  student: StudentRosterItem;
  activeSemesterId: string;
}) {
  const [open, setOpen] = useState(false);
  const [lastName, setLastName] = useState(student.last_name);
  const [firstName, setFirstName] = useState(student.first_name);
  const [middleName, setMiddleName] = useState(student.middle_name ?? "");
  const [suffix, setSuffix] = useState(student.suffix ?? "");
  const [email, setEmail] = useState(student.email ?? "");
  const [yearLevel, setYearLevel] = useState(student.year_level.toString());
  const [academicStatus, setAcademicStatus] = useState<"regular" | "irregular">(
    student.academic_status,
  );

  const [state, formAction, isPending] = useActionState(
    async (prev: StudentActionResult | null, formData: FormData) => {
      const result = await updateStudentAction(prev, formData);
      if (result.success) {
        setOpen(false);
      }
      return result;
    },
    null,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs font-medium">
            <Pencil className="size-3.5 text-muted-foreground" />
            Edit
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="text-left">
          <DialogTitle className="font-heading text-lg font-semibold text-foreground">
            Edit Student Details
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Update demographic profile and active semester enrollment attributes. Identity continuity is strictly maintained.
          </DialogDescription>
        </DialogHeader>

        {state && !state.success && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-error-surface p-3 text-xs text-foreground"
          >
            {state.error}
          </div>
        )}

        <form action={formAction} className="flex flex-col gap-4 py-1">
          <input type="hidden" name="semester_id" value={activeSemesterId} />
          <input type="hidden" name="student_id" value={student.student_id} />
          <input type="hidden" name="year_level" value={yearLevel} />
          <input type="hidden" name="academic_status" value={academicStatus} />

          {/* Student Number (Immutable Identity Key) */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit_university_id" className="text-xs font-medium text-foreground">
              Student Number
            </label>
            <Input
              id="edit_university_id"
              value={student.university_id}
              disabled
              className="font-mono text-sm uppercase opacity-75"
            />
            <p className="text-[11px] text-muted-foreground">
              The student number is the stable domain key and cannot be altered.
            </p>
          </div>

          {/* Demographic Fields */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="edit_last_name" className="text-xs font-medium text-foreground">
                Last Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="edit_last_name"
                name="last_name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="edit_first_name" className="text-xs font-medium text-foreground">
                First Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="edit_first_name"
                name="first_name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="edit_middle_name" className="text-xs font-medium text-foreground">
                Middle Name <span className="text-muted-foreground">(Optional)</span>
              </label>
              <Input
                id="edit_middle_name"
                name="middle_name"
                value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
                placeholder="Leave blank for null"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="edit_suffix" className="text-xs font-medium text-foreground">
                Suffix <span className="text-muted-foreground">(Optional)</span>
              </label>
              <Input
                id="edit_suffix"
                name="suffix"
                value={suffix}
                onChange={(e) => setSuffix(e.target.value)}
                placeholder="e.g. Jr., III"
              />
            </div>
          </div>

          {/* Institutional Email */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit_email" className="text-xs font-medium text-foreground">
              Institutional Email <span className="text-muted-foreground">(Optional)</span>
            </label>
            <Input
              id="edit_email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student@university.edu.ph"
            />
          </div>

          {/* Enrollment Attributes */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="edit_year_select" className="text-xs font-medium text-foreground">
                Year Level (Active Semester) <span className="text-destructive">*</span>
              </label>
              <Select value={yearLevel} onValueChange={(val) => setYearLevel(val ?? "1")}>
                <SelectTrigger id="edit_year_select" className="w-full">
                  <SelectValue placeholder="Select Year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Year 1</SelectItem>
                  <SelectItem value="2">Year 2</SelectItem>
                  <SelectItem value="3">Year 3</SelectItem>
                  <SelectItem value="4">Year 4</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="edit_status_select" className="text-xs font-medium text-foreground">
                Academic Status <span className="text-destructive">*</span>
              </label>
              <Select
                value={academicStatus}
                onValueChange={(val) => setAcademicStatus((val as "regular" | "irregular") ?? "regular")}
              >
                <SelectTrigger id="edit_status_select" className="w-full">
                  <SelectValue placeholder="Select Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="regular">Regular</SelectItem>
                  <SelectItem value="irregular">Irregular</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="w-full gap-2 font-medium sm:w-auto"
            >
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
