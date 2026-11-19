"use client";

import Link from "next/link";
import { useId, useMemo, useState, useTransition } from "react";
import {
  ArrowLeft,
  Award,
  Check,
  CheckCircle2,
  CircleAlert,
  Info,
  Loader2,
  Search,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { sortName } from "@/lib/format-name";
import { cn } from "@/lib/utils";
import {
  submitMeritEndorsementsAction,
  type SubmitMeritEndorsementsResult,
} from "../actions";
import type {
  InstructorChoice,
  MeritEndorsementRecipientOption,
} from "../contracts";
import {
  endorsementDescriptionSchema,
  MAX_ENDORSEMENT_DAYS,
  requestedDaysSchema,
} from "../schemas";

type Step = "students" | "details" | "review" | "result";
type Picked = { studentId: string; requestKey: string };

const STEPS: { id: Exclude<Step, "result">; label: string }[] = [
  { id: "students", label: "Students" },
  { id: "details", label: "Details" },
  { id: "review", label: "Review" },
];

const MATCH_LIMIT = 20;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export function SubmitEndorsementsFlow({
  students,
  instructors,
  currentProfileId,
  initialStudentId,
  listHref,
}: {
  students: MeritEndorsementRecipientOption[];
  instructors: InstructorChoice[];
  currentProfileId?: string;
  initialStudentId?: string;
  listHref: string;
}) {
  const [step, setStep] = useState<Step>("students");

  // Filter out the officer's own profile so self-endorsement cannot be picked
  const eligibleStudents = useMemo(() => {
    return currentProfileId
      ? students.filter((s) => s.student_id !== currentProfileId)
      : students;
  }, [students, currentProfileId]);

  const [picked, setPicked] = useState<Picked[]>(() =>
    initialStudentId && eligibleStudents.some((s) => s.student_id === initialStudentId)
      ? [{ studentId: initialStudentId, requestKey: crypto.randomUUID() }]
      : []
  );

  const [search, setSearch] = useState("");
  const [instructorId, setInstructorId] = useState("");
  const [requestedDays, setRequestedDays] = useState("1");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitMeritEndorsementsResult | null>(null);

  // Request keys are bound to the details they were first sent with, so details lock after an attempt.
  const [locked, setLocked] = useState(false);
  const [isPending, startTransition] = useTransition();

  const ids = {
    search: useId(),
    instructor: useId(),
    days: useId(),
    description: useId(),
  };

  const byId = useMemo(
    () => new Map(eligibleStudents.map((s) => [s.student_id, s])),
    [eligibleStudents]
  );
  const pickedIds = new Set(picked.map((p) => p.studentId));

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? eligibleStudents.filter(
          (s) =>
            sortName(s).toLowerCase().includes(q) ||
            s.university_id.toLowerCase().includes(q)
        )
      : eligibleStudents;
  }, [eligibleStudents, search]);

  const label = (id: string) => {
    const s = byId.get(id);
    return s ? `${sortName(s)} · ${s.university_id}` : "Student";
  };

  const selectedInstructor = useMemo(
    () => instructors.find((i) => i.id === instructorId),
    [instructors, instructorId]
  );

  function toggle(studentId: string) {
    setError(null);
    setPicked((prev) =>
      prev.some((p) => p.studentId === studentId)
        ? prev.filter((p) => p.studentId !== studentId)
        : [...prev, { studentId, requestKey: crypto.randomUUID() }]
    );
  }

  function detailsError(): string | null {
    if (!instructorId) return "Select an assigned instructor.";
    const daysCheck = requestedDaysSchema.safeParse(requestedDays);
    if (!daysCheck.success) return daysCheck.error.issues[0]?.message ?? "Days must be a whole number.";
    const descCheck = endorsementDescriptionSchema.safeParse(description);
    if (!descCheck.success) return descCheck.error.issues[0]?.message ?? "Description must be at least 3 characters.";
    return null;
  }

  function go(next: Step) {
    const problem =
      next === "details" && !picked.length
        ? "Select at least one student."
        : next === "review"
        ? detailsError()
        : null;
    setError(problem);
    if (problem) return;
    setStep(next);
    window.scrollTo({ top: 0 });
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      try {
        const outcome = await submitMeritEndorsementsAction({
          recipients: picked,
          instructorId,
          requestedDays: Number(requestedDays),
          description: description.trim(),
        });

        if (!outcome.success && !outcome.endorsedIds.length && !outcome.failures.length) {
          setError(outcome.error);
          return;
        }

        setLocked(true);
        // Successfully endorsed students leave the selection; failed ones keep their keys for retry.
        setPicked((prev) => prev.filter((p) => !outcome.endorsedIds.includes(p.studentId)));
        setResult(outcome);
        setStep("result");
        window.scrollTo({ top: 0 });
      } catch {
        setLocked(true);
        setError(
          "Unable to reach the server. Some endorsements may have been submitted; confirming again will not repeat them."
        );
      }
    });
  }

  function startOver() {
    setPicked([]);
    setSearch("");
    setRequestedDays("1");
    setDescription("");
    setError(null);
    setResult(null);
    setLocked(false);
    setStep("students");
    window.scrollTo({ top: 0 });
  }

  const daysNum = Math.max(1, Number(requestedDays) || 1);
  const totalDays = picked.length * daysNum;
  const endorseLabel = `Submit endorsement for ${plural(picked.length, "student")}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href={listHref}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Back to disciplinary ledger
          </Link>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Endorse students for merit
          </h1>
          <p className="text-xs text-muted-foreground">
            Recommend enrolled students for merit recognition to an assigned faculty reviewer.
          </p>
        </div>
        {step !== "result" && (
          <ol className="flex items-center gap-2 text-sm" aria-label="Endorsement submission steps">
            {STEPS.map((item, index) => {
              const current = STEPS.findIndex((s) => s.id === step);
              return (
                <li
                  key={item.id}
                  aria-current={index === current ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-2",
                    index === current ? "font-semibold text-foreground" : "text-muted-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full border text-xs",
                      index < current
                        ? "border-primary bg-primary text-primary-foreground"
                        : index === current
                        ? "border-primary text-primary"
                        : "border-border"
                    )}
                  >
                    {index < current ? <Check className="size-3.5" /> : index + 1}
                  </span>
                  {item.label}
                  {index < STEPS.length - 1 && <span aria-hidden className="h-px w-6 bg-border" />}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" /> {error}
        </p>
      )}

      {step === "students" && (
        <Card className="flex flex-col gap-4 p-4 sm:p-6">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.search} className="text-sm font-medium">
              Find enrolled students
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id={ids.search}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or student number"
                className="h-10 pl-8"
              />
            </div>
          </div>

          {picked.length > 0 && (
            <div className="flex flex-wrap gap-1.5" aria-label="Selected students">
              {picked.map((p) => (
                <span
                  key={p.studentId}
                  className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs"
                >
                  {label(p.studentId)}
                  <button
                    type="button"
                    onClick={() => toggle(p.studentId)}
                    aria-label={`Remove ${label(p.studentId)}`}
                    className="flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <ul className="divide-y divide-border/60 rounded-lg border border-border">
            {matches.length === 0 && (
              <li className="p-4 text-center text-sm text-muted-foreground">
                {eligibleStudents.length
                  ? "No students match this search."
                  : "No students are enrolled in the current semester."}
              </li>
            )}
            {matches.slice(0, MATCH_LIMIT).map((s) => {
              const selected = pickedIds.has(s.student_id);
              return (
                <li key={s.student_id}>
                  <button
                    type="button"
                    onClick={() => toggle(s.student_id)}
                    aria-pressed={selected}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors",
                      selected ? "bg-primary/10" : "hover:bg-muted/50"
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-full border",
                        selected ? "border-primary bg-primary text-primary-foreground" : "border-border"
                      )}
                    >
                      {selected && <Check className="size-3" />}
                    </span>
                    <span className="flex-1 font-medium text-foreground">{sortName(s)}</span>
                    <span className="font-mono text-xs text-muted-foreground">{s.university_id}</span>
                    <span className="text-xs text-muted-foreground">Year {s.year_level}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="outline" nativeButton={false} render={<Link href={listHref} />}>
              Cancel
            </Button>
            <Button onClick={() => go("details")} disabled={!picked.length} className="gap-2">
              Continue with {plural(picked.length, "student")}
            </Button>
          </div>
        </Card>
      )}

      {step === "details" && (
        <Card className="flex flex-col gap-6 p-4 sm:p-6">
          <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0 text-primary" />
            <div>
              <p className="font-medium text-foreground">Recommendation Process</p>
              <p className="mt-0.5">
                Council merit endorsements are recommendations sent to an Academic or Clinical Instructor for review.
                Endorsements enter Pending status and are not usable merits until approved by the assigned instructor.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={ids.instructor} className="text-sm font-medium">
                Assigned instructor reviewer
              </label>
              <select
                id={ids.instructor}
                value={instructorId}
                onChange={(e) => {
                  setInstructorId(e.target.value);
                  setError(null);
                }}
                className={cn(
                  "h-10 rounded-lg border bg-background px-3 text-sm",
                  error && !instructorId
                    ? "border-destructive focus-visible:ring-destructive"
                    : "border-input"
                )}
              >
                <option value="">Select an instructor reviewer...</option>
                {instructors.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.last_name}, {inst.first_name} ({inst.instructor_role})
                  </option>
                ))}
              </select>
              {error && !instructorId ? (
                <p className="text-xs text-destructive">Select an assigned instructor to review this endorsement.</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Only active Academic and Clinical Instructors can decide merit endorsements.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor={ids.days} className="text-sm font-medium">
                Requested days per student
              </label>
              <Input
                id={ids.days}
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_ENDORSEMENT_DAYS}
                step={1}
                value={requestedDays}
                onChange={(e) => setRequestedDays(e.target.value)}
                className="h-10 max-w-xs"
              />
              <p className="text-xs text-muted-foreground">
                Whole-day units to recommend for each selected recipient, up to {MAX_ENDORSEMENT_DAYS}.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor={ids.description} className="text-sm font-medium">
                Basis / Justification
              </label>
              <textarea
                id={ids.description}
                rows={4}
                maxLength={500}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="State the student's contribution, event service, or reason for this merit recommendation..."
                className="flex min-h-[5rem] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>At least 3 characters.</span>
                <span>{description.trim().length}/500</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button variant="outline" onClick={() => go("students")}>
              Back
            </Button>
            <Button onClick={() => go("review")} className="gap-2">
              Review endorsement
            </Button>
          </div>
        </Card>
      )}

      {step === "review" && (
        <Card className="flex flex-col gap-6 p-4 sm:p-6">
          <div className="grid gap-4 rounded-lg border border-border/60 bg-muted/20 p-4 text-xs sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">Recipients:</span>{" "}
              <span className="font-semibold text-foreground">{plural(picked.length, "student")}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Requested Units:</span>{" "}
              <span className="font-semibold text-foreground">
                {requestedDays} {requestedDays === "1" ? "day" : "days"} each ({totalDays} days total)
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Assigned Reviewer:</span>{" "}
              <span className="font-semibold text-foreground">
                {selectedInstructor
                  ? `${selectedInstructor.first_name} ${selectedInstructor.last_name} (${selectedInstructor.instructor_role})`
                  : "Instructor"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Status After Submission:</span>{" "}
              <span className="font-semibold text-amber-600 dark:text-amber-400">Pending Review</span>
            </div>
            <div className="sm:col-span-2">
              <span className="text-muted-foreground">Basis / Justification:</span>
              <p className="mt-1 font-medium text-foreground">{description.trim()}</p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Selected Students ({picked.length})
            </h2>
            <ul className="max-h-48 divide-y divide-border/60 overflow-y-auto rounded-lg border border-border text-xs">
              {picked.map((p) => (
                <li key={p.studentId} className="px-3 py-2">
                  {label(p.studentId)}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-muted-foreground">
            Submitting records a formal endorsement recommendation in the disciplinary ledger.
            {locked &&
              " Details stay fixed so confirming again cannot repeat recorded endorsements; start over to change them."}
          </p>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            {locked ? (
              <Button variant="outline" onClick={startOver} disabled={isPending}>
                Start over
              </Button>
            ) : (
              <Button variant="outline" onClick={() => go("details")} disabled={isPending}>
                Back
              </Button>
            )}
            <Button onClick={confirm} disabled={isPending} className="gap-2">
              {isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Award className="size-4" />
              )}
              {isPending ? "Submitting endorsements…" : endorseLabel}
            </Button>
          </div>
        </Card>
      )}

      {step === "result" && result && (
        <Card className="flex flex-col gap-6 p-4 sm:p-6">
          {result.success ? (
            <div className="flex items-start gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div>
                <p className="font-semibold">
                  Endorsement submitted for {plural(result.endorsedIds.length, "student")}.
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  The recommendation is now in Pending status awaiting review by{" "}
                  {selectedInstructor
                    ? `${selectedInstructor.first_name} ${selectedInstructor.last_name}`
                    : "the assigned instructor"}
                  . Recipient students will be notified once a decision is made.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                <CircleAlert className="mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="font-semibold">{result.error}</p>
                  {result.endorsedIds.length > 0 && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {plural(result.endorsedIds.length, "student")} recorded successfully; {plural(result.failures.length, "student")} failed.
                    </p>
                  )}
                </div>
              </div>

              {result.failures.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Failed Entries
                  </h2>
                  <ul className="divide-y divide-border/60 rounded-lg border border-border text-xs">
                    {result.failures.map((f) => (
                      <li key={f.studentId} className="flex items-center justify-between p-3">
                        <span className="font-medium">{label(f.studentId)}</span>
                        <span className="text-destructive">{f.error}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button variant="outline" nativeButton={false} render={<Link href={listHref} />}>
              Done
            </Button>
            <Button onClick={startOver} className="gap-2">
              Endorse more students
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
