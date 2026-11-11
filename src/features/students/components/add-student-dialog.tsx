"use client";

import { useActionState, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Loader2, UserPlus } from "lucide-react";

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
import { createStudentAction, lookupStudentAction } from "../actions";
import type { StudentActionResult, StudentConflictPreview } from "../contracts";

export function AddStudentDialog({ activeSemesterId }: { activeSemesterId: string }) {
  const [open, setOpen] = useState(false);
  const [universityId, setUniversityId] = useState("");
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [suffix, setSuffix] = useState("");
  const [email, setEmail] = useState("");
  const [yearLevel, setYearLevel] = useState("1");
  const [academicStatus, setAcademicStatus] = useState<"regular" | "irregular">("regular");

  const [preview, setPreview] = useState<StudentConflictPreview | null>(null);
  const [isLookingUp, startLookup] = useTransition();

  const resetForm = () => {
    setUniversityId("");
    setLastName("");
    setFirstName("");
    setMiddleName("");
    setSuffix("");
    setEmail("");
    setYearLevel("1");
    setAcademicStatus("regular");
    setPreview(null);
  };

  const [state, formAction, isPending] = useActionState(
    async (prev: StudentActionResult | null, formData: FormData) => {
      const result = await createStudentAction(prev, formData);
      if (result.success) {
        setOpen(false);
        resetForm();
      }
      return result;
    },
    null,
  );

  const handleUniversityIdChange = (val: string) => {
    setUniversityId(val);
    const trimmed = val.trim();
    if (/^[0-9]{2}-1-[0-9]{5}$/.test(trimmed)) {
      startLookup(async () => {
        const res = await lookupStudentAction(trimmed, activeSemesterId);
        setPreview(res);
        if (res.exists && !res.is_enrolled_in_active_semester) {
          if (res.last_name) setLastName(res.last_name);
          if (res.first_name) setFirstName(res.first_name);
          if (res.middle_name) setMiddleName(res.middle_name);
          if (res.suffix) setSuffix(res.suffix);
          if (res.email) setEmail(res.email);
        }
      });
    } else {
      setPreview(null);
    }
  };

  const isDuplicate = preview?.exists && preview.is_enrolled_in_active_semester;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger
        render={
          <Button className="w-full gap-2 font-medium sm:w-auto">
            <UserPlus className="size-4" />
            Add Student
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="text-left">
          <DialogTitle className="font-heading text-lg font-semibold text-foreground">
            Add Student to Roster
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Enroll an individual student for the active academic semester. Re-entering an existing student preserves their historical record relationships.
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
          <input type="hidden" name="year_level" value={yearLevel} />
          <input type="hidden" name="academic_status" value={academicStatus} />

          {/* Student Number (university_id) */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="university_id" className="text-xs font-medium text-foreground">
              Student Number <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <Input
                id="university_id"
                name="university_id"
                value={universityId}
                onChange={(e) => handleUniversityIdChange(e.target.value)}
                placeholder="26-1-00123"
                required
                className="font-mono text-sm uppercase"
              />
              {isLookingUp && (
                <div className="absolute right-2.5 top-2 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                </div>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Format: 2 digits, hyphen, 1, hyphen, 5 digits (e.g. 26-1-00123).
            </p>
          </div>

          {/* Conflict / Identity Preview Banner */}
          {isDuplicate && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-error-surface p-3 text-xs text-foreground"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div>
                <p className="font-semibold text-destructive">Already Enrolled</p>
                <p className="mt-0.5 text-muted-foreground">
                  Student {preview.last_name ? `(${preview.last_name}, ${preview.first_name})` : ""}{" "}
                  is already enrolled in the active semester. Duplicate enrollment is blocked.
                </p>
              </div>
            </div>
          )}

          {preview?.exists && !isDuplicate && (
            <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs text-foreground">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <p className="font-semibold text-primary">Identity Continuity</p>
                <p className="mt-0.5 text-muted-foreground">
                  Found existing profile for <strong>{preview.last_name}, {preview.first_name}</strong>. Re-enrolling will link to their existing student profile without altering historical records.
                </p>
              </div>
            </div>
          )}

          {/* Name Fields */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="last_name" className="text-xs font-medium text-foreground">
                Last Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="last_name"
                name="last_name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Dela Cruz"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="first_name" className="text-xs font-medium text-foreground">
                First Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="first_name"
                name="first_name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Juan Carlos"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="middle_name" className="text-xs font-medium text-foreground">
                Middle Name <span className="text-muted-foreground">(Optional)</span>
              </label>
              <Input
                id="middle_name"
                name="middle_name"
                value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
                placeholder="Santos"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="suffix" className="text-xs font-medium text-foreground">
                Suffix <span className="text-muted-foreground">(Optional)</span>
              </label>
              <Input
                id="suffix"
                name="suffix"
                value={suffix}
                onChange={(e) => setSuffix(e.target.value)}
                placeholder="Jr., III"
              />
            </div>
          </div>

          {/* Institutional Email */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-xs font-medium text-foreground">
              Institutional Email <span className="text-muted-foreground">(Optional)</span>
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="juan.delacruz@university.edu.ph"
            />
            <p className="text-[11px] text-muted-foreground">
              Used for account invitation (FL-008). Can be provided or updated later.
            </p>
          </div>

          {/* Enrollment Attributes */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="year-select" className="text-xs font-medium text-foreground">
                Year Level <span className="text-destructive">*</span>
              </label>
              <Select value={yearLevel} onValueChange={(val) => setYearLevel(val ?? "1")}>
                <SelectTrigger id="year-select" className="w-full">
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
              <label htmlFor="status-select" className="text-xs font-medium text-foreground">
                Academic Status <span className="text-destructive">*</span>
              </label>
              <Select
                value={academicStatus}
                onValueChange={(val) => setAcademicStatus((val as "regular" | "irregular") ?? "regular")}
              >
                <SelectTrigger id="status-select" className="w-full">
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
              disabled={isPending || Boolean(isDuplicate)}
              className="w-full gap-2 font-medium sm:w-auto"
            >
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Add to Roster
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
