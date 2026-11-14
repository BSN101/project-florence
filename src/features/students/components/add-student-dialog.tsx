"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
import { sortName } from "@/features/access/components/provisioning-ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createStudentAction, lookupStudentAction } from "../actions";
import type { RosterCandidate, StudentActionResult } from "../contracts";

export function AddStudentDialog({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [universityId, setUniversityId] = useState("");
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [suffix, setSuffix] = useState("");
  const [email, setEmail] = useState("");
  const [yearLevel, setYearLevel] = useState("1");
  const [academicStatus, setAcademicStatus] = useState<"regular" | "irregular">("regular");

  const [preview, setPreview] = useState<RosterCandidate | null>(null);
  const [lookupFailed, setLookupFailed] = useState(false);
  const [isLookingUp, startLookup] = useTransition();
  // Ignores lookup responses for a number the user has since changed.
  const latestLookup = useRef("");

  const setIdentity = (p: Pick<RosterCandidate, "last_name" | "first_name" | "middle_name" | "suffix" | "email"> | null) => {
    setLastName(p?.last_name ?? "");
    setFirstName(p?.first_name ?? "");
    setMiddleName(p?.middle_name ?? "");
    setSuffix(p?.suffix ?? "");
    setEmail(p?.email ?? "");
  };

  const resetForm = () => {
    setUniversityId("");
    setIdentity(null);
    setYearLevel("1");
    setAcademicStatus("regular");
    setPreview(null);
    setLookupFailed(false);
    latestLookup.current = "";
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
    latestLookup.current = trimmed;
    // Drop details pre-filled from a previously found profile.
    if (preview) setIdentity(null);
    setPreview(null);
    setLookupFailed(false);
    if (!/^[0-9]{2}-1-[0-9]{5}$/.test(trimmed)) return;
    startLookup(async () => {
      try {
        const res = await lookupStudentAction(trimmed);
        if (latestLookup.current !== trimmed) return;
        setPreview(res);
        if (res) setIdentity(res);
      } catch {
        if (latestLookup.current === trimmed) setLookupFailed(true);
      }
    });
  };

  const isDuplicate = Boolean(preview?.enrolled_in_current);
  const isArchived = Boolean(preview && preview.account_status !== "active");
  // An existing profile keeps its identity; names are changed through Edit.
  const isExisting = Boolean(preview);

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
          <Button className={cn("gap-2 font-medium whitespace-nowrap", className)}>
            <Plus className="size-4 shrink-0" />
            <span>Add Student</span>
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="text-left">
          <DialogTitle className="font-heading text-lg font-semibold text-foreground">
            Add Student to Roster
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Enroll an individual student in the current semester. Re-entering an existing student reuses their profile and keeps their history.
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
          {lookupFailed && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-error-surface p-3 text-xs text-foreground">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p>We couldn&rsquo;t check this student number. You can still submit; Florence checks it again when saving.</p>
            </div>
          )}

          {preview && (isDuplicate || isArchived) && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-error-surface p-3 text-xs text-foreground"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div>
                <p className="font-semibold text-destructive">{isArchived ? "Archived Account" : "Already Enrolled"}</p>
                <p className="mt-0.5 text-muted-foreground">
                  {sortName(preview)}{" "}
                  {isArchived
                    ? "has an archived account and can\u2019t be enrolled. Contact a Platform Admin."
                    : "is already enrolled in the current semester."}
                </p>
              </div>
            </div>
          )}

          {preview && !isDuplicate && !isArchived && (
            <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs text-foreground">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <p className="font-semibold text-primary">Existing Student</p>
                <p className="mt-0.5 text-muted-foreground">
                  Found <strong>{sortName(preview)}</strong>. Enrolling links to their existing profile and keeps their history. Change their name or email with Edit after enrolling.
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
                readOnly={isExisting}
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
                readOnly={isExisting}
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
                readOnly={isExisting}
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
                readOnly={isExisting}
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
              readOnly={isExisting}
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
              disabled={isPending || isDuplicate || isArchived}
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
