"use client";

import Link from "next/link";
import { useId, useMemo, useState, useTransition } from "react";
import { ArrowLeft, CircleAlert, FileWarning, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { sortName } from "@/lib/format-name";
import { logFacultyDemeritsAction, type LogFacultyDemeritsResult } from "../actions";
import type { AwardRecipientOption, DisciplinaryBucket, MisconductOption } from "../contracts";
import { demeritDaysSchema, MAX_ENTRY_DAYS } from "../schemas";
import {
  EntryFlowResultCard,
  EntryFlowStepper,
  plural,
  StudentPickerStep,
  type EntryFlowStep as Step,
} from "./entry-flow-shared";

type Picked = { studentId: string; requestKey: string };

export function LogDemeritsFlow({
  students,
  misconductOptions,
  bucket,
  semesterLabel,
  startsOn,
  latestDate,
  initialStudentId,
  listHref,
}: {
  students: AwardRecipientOption[];
  misconductOptions: MisconductOption[];
  /** Fixed by the instructor's role: Academic → Office, Clinical → RLE. */
  bucket: DisciplinaryBucket;
  semesterLabel: string;
  startsOn: string;
  /** The earlier of today (Asia/Manila) and the semester's last day. */
  latestDate: string;
  initialStudentId?: string;
  listHref: string;
}) {
  const [step, setStep] = useState<Step>("students");
  const [picked, setPicked] = useState<Picked[]>(() =>
    initialStudentId ? [{ studentId: initialStudentId, requestKey: crypto.randomUUID() }] : []
  );
  const [search, setSearch] = useState("");
  const [misconductId, setMisconductId] = useState<string>(() => misconductOptions[0]?.id ?? "");
  const [days, setDays] = useState("1");
  const [incidentOn, setIncidentOn] = useState(latestDate);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LogFacultyDemeritsResult | null>(null);
  // Request keys are bound to the details they were first sent with, so details lock after an attempt.
  const [locked, setLocked] = useState(false);
  const [isPending, startTransition] = useTransition();

  const ids = {
    search: useId(),
    misconduct: useId(),
    days: useId(),
    date: useId(),
    notes: useId(),
  };

  const byId = useMemo(() => new Map(students.map((s) => [s.student_id, s])), [students]);

  const selectedMisconduct = useMemo(
    () => misconductOptions.find((m) => m.id === misconductId) ?? misconductOptions[0],
    [misconductOptions, misconductId]
  );
  const isOther = Boolean(selectedMisconduct?.is_other);

  const label = (id: string) => {
    const s = byId.get(id);
    return s ? `${sortName(s)} · ${s.university_id}` : "Student";
  };

  function toggle(studentId: string) {
    setError(null);
    setPicked((prev) =>
      prev.some((p) => p.studentId === studentId)
        ? prev.filter((p) => p.studentId !== studentId)
        : [...prev, { studentId, requestKey: crypto.randomUUID() }]
    );
  }

  function detailsError(): string | null {
    if (!misconductId) return "Select a misconduct violation.";
    const daysCheck = demeritDaysSchema.safeParse(days);
    if (!daysCheck.success) return daysCheck.error.issues[0].message;
    if (!incidentOn || incidentOn < startsOn || incidentOn > latestDate) {
      return `The incident date must be between ${startsOn} and ${latestDate}.`;
    }
    if (isOther && (!notes || notes.trim().length < 3)) {
      return "Describe the specific misconduct when selecting Other (at least 3 characters).";
    }
    if (notes && notes.length > 500) {
      return "Notes cannot exceed 500 characters.";
    }
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
        const outcome = await logFacultyDemeritsAction({
          recipients: picked,
          misconductId,
          isOther,
          days: Number(days),
          incidentOn,
          notes: notes.trim(),
        });

        if (!outcome.success && !outcome.recordedIds.length && !outcome.failures.length) {
          setError(outcome.error);
          return;
        }

        setLocked(true);
        // Successfully logged students leave the selection; failed ones keep their keys for a safe retry.
        setPicked((prev) => prev.filter((p) => !outcome.recordedIds.includes(p.studentId)));
        setResult(outcome);
        setStep("result");
        window.scrollTo({ top: 0 });
      } catch {
        setLocked(true);
        setError(
          "Unable to reach the server. Some demerits may have been recorded; confirming again will not repeat them."
        );
      }
    });
  }

  function startOver() {
    setPicked([]);
    setSearch("");
    setDays("1");
    setIncidentOn(latestDate);
    setNotes("");
    setError(null);
    setResult(null);
    setLocked(false);
    setStep("students");
  }

  const dayCount = Number(days) || 0;
  const demeritLabel = `Log ${plural(dayCount, "day")} for ${plural(picked.length, "student")}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit gap-1"
          nativeButton={false}
          render={<Link href={listHref} />}
        >
          <ArrowLeft className="size-4" /> My entries
        </Button>
        <div>
          <h2 className="section-title">Log faculty demerits</h2>
          <p className="text-sm text-muted-foreground">
            Whole-day incident sanctions for {semesterLabel}. Multi-day entries record individual 1-day units sharing the incident context.
          </p>
        </div>
        {step !== "result" && <EntryFlowStepper step={step} ariaLabel="Demerit logging steps" />}
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
        <StudentPickerStep
          searchId={ids.search}
          students={students}
          picked={picked}
          search={search}
          onSearchChange={setSearch}
          onToggle={toggle}
          onContinue={() => go("details")}
          labelOf={label}
        />
      )}

      {step === "details" && (
        <Card className="flex flex-col gap-4 p-4 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Applicable bucket</span>
              <div className="flex h-10 items-center rounded-lg border border-input bg-muted/30 px-3 text-sm font-medium">
                <span className="uppercase">{bucket}</span>
                <span className="ml-2 text-xs text-muted-foreground">(assigned instructor bucket)</span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor={ids.misconduct} className="text-sm font-medium">
                Misconduct violation
              </label>
              <select
                id={ids.misconduct}
                value={misconductId}
                onChange={(e) => setMisconductId(e.target.value)}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
              >
                {misconductOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={ids.days} className="text-sm font-medium">
                Days per student
              </label>
              <Input
                id={ids.days}
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_ENTRY_DAYS}
                step={1}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="h-10 font-mono"
              />
              <span className="text-xs text-muted-foreground">Whole days only, up to {MAX_ENTRY_DAYS}. Defaults to 1.</span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor={ids.date} className="text-sm font-medium">
                Incident date
              </label>
              <Input
                id={ids.date}
                type="date"
                min={startsOn}
                max={latestDate}
                value={incidentOn}
                onChange={(e) => setIncidentOn(e.target.value)}
                className="h-10 font-mono"
              />
              <span className="text-xs text-muted-foreground">Between {startsOn} and {latestDate}.</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor={ids.notes} className="text-sm font-medium">
                {isOther ? "Incident description (required)" : "Additional details (optional)"}
              </label>
              <span className="text-xs text-muted-foreground">{notes.length}/500</span>
            </div>
            <textarea
              id={ids.notes}
              rows={4}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                isOther
                  ? "Describe the specific misconduct and circumstance (required for Other)"
                  : "Optional notes or circumstance regarding the violation"
              }
              className="w-full rounded-lg border border-input bg-background p-2.5 text-sm"
            />
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button variant="outline" onClick={() => go("students")}>
              Back
            </Button>
            <Button onClick={() => go("review")}>Review demerit</Button>
          </div>
        </Card>
      )}

      {step === "review" && (
        <Card className="flex flex-col gap-5 p-4 sm:p-6">
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Applicable bucket</dt>
              <dd className="font-semibold uppercase tracking-wider">{bucket}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Days per student</dt>
              <dd className="font-semibold">{plural(dayCount, "day")}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Incident date</dt>
              <dd className="font-mono">{incidentOn}</dd>
            </div>
            <div className="sm:col-span-3">
              <dt className="text-muted-foreground">Violation</dt>
              <dd className="font-medium text-foreground">{selectedMisconduct?.label}</dd>
            </div>
            {notes.trim() && (
              <div className="sm:col-span-3">
                <dt className="text-muted-foreground">Description / Notes</dt>
                <dd className="whitespace-pre-wrap">{notes.trim()}</dd>
              </div>
            )}
          </dl>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">{plural(picked.length, "student")}</p>
            <ul className="divide-y divide-border/60 rounded-lg border border-border text-sm">
              {picked.map((p) => (
                <li key={p.studentId} className="px-3 py-2">
                  {label(p.studentId)}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-muted-foreground">
            Each student is notified in Florence. Demerits cannot be edited after they are recorded.
            {locked && " Details stay fixed so confirming again cannot repeat recorded demerits; start over to change them."}
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
                <FileWarning className="size-4" />
              )}
              {isPending ? "Recording demerits…" : demeritLabel}
            </Button>
          </div>
        </Card>
      )}

      {step === "result" && result && (
        <EntryFlowResultCard
          success={result.success}
          succeededIds={result.recordedIds}
          failures={result.success ? [] : result.failures}
          successText={`Logged ${plural(dayCount, "day")} for ${plural(result.recordedIds.length, "student")}`}
          retryableCount={result.success ? 0 : picked.length}
          listHref={listHref}
          listLabel="View my entries"
          recordMoreLabel="Log more"
          labelOf={label}
          onRetry={() => setStep("review")}
          onStartOver={startOver}
        />
      )}
    </div>
  );
}
