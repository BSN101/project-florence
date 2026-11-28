"use client";

import Link from "next/link";
import { useId, useMemo, useState, useTransition } from "react";
import { ArrowLeft, Award, CircleAlert, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { sortName } from "@/lib/format-name";
import { awardDirectMeritsAction, type AwardDirectMeritsResult } from "../actions";
import { meritExpiryDate } from "../calculations";
import type { AwardRecipientOption } from "../contracts";
import { MAX_ENTRY_DAYS, meritDaysSchema, meritDescriptionSchema } from "../schemas";
import {
  EntryFlowResultCard,
  EntryFlowStepper,
  plural,
  StudentPickerStep,
  type EntryFlowStep as Step,
} from "./entry-flow-shared";

/** `requestKey` is made when the student is picked, so a retry of the same award replays instead of repeating it. */
type Picked = { studentId: string; requestKey: string };

export function AwardMeritsFlow({
  students,
  semesterLabel,
  startsOn,
  latestDate,
  initialStudentId,
  listHref,
}: {
  students: AwardRecipientOption[];
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
  const [days, setDays] = useState("1");
  const [awardedOn, setAwardedOn] = useState(latestDate);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AwardDirectMeritsResult | null>(null);
  // Request keys are bound to the details they were first sent with, so details lock after an attempt.
  const [locked, setLocked] = useState(false);
  const [isPending, startTransition] = useTransition();
  const ids = { search: useId(), days: useId(), date: useId(), reason: useId() };

  const byId = useMemo(() => new Map(students.map((s) => [s.student_id, s])), [students]);
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
    const daysCheck = meritDaysSchema.safeParse(days);
    if (!daysCheck.success) return daysCheck.error.issues[0].message;
    if (!awardedOn || awardedOn < startsOn || awardedOn > latestDate) {
      return `The award date must be between ${startsOn} and ${latestDate}.`;
    }
    const reasonCheck = meritDescriptionSchema.safeParse(description);
    return reasonCheck.success ? null : reasonCheck.error.issues[0].message;
  }

  function go(next: Step) {
    const problem = next === "details" && !picked.length ? "Select at least one student."
      : next === "review" ? detailsError() : null;
    setError(problem);
    if (problem) return;
    setStep(next);
    window.scrollTo({ top: 0 });
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      try {
        const outcome = await awardDirectMeritsAction({
          recipients: picked,
          days: Number(days),
          awardedOn,
          description: description.trim(),
        });
        if (!outcome.success && !outcome.awardedIds.length && !outcome.failures.length) {
          setError(outcome.error);
          return;
        }
        setLocked(true);
        // Awarded students leave the selection; failed ones keep their keys for a safe retry.
        setPicked((prev) => prev.filter((p) => !outcome.awardedIds.includes(p.studentId)));
        setResult(outcome);
        setStep("result");
        window.scrollTo({ top: 0 });
      } catch {
        setLocked(true);
        setError("Unable to reach the server. Some awards may have been recorded; confirming again will not repeat them.");
      }
    });
  }

  function startOver() {
    setPicked([]);
    setSearch("");
    setDays("1");
    setAwardedOn(latestDate);
    setDescription("");
    setError(null);
    setResult(null);
    setLocked(false);
    setStep("students");
  }

  const dayCount = Number(days) || 0;
  const awardLabel = `Award ${plural(dayCount, "day")} to ${plural(picked.length, "student")}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Button variant="ghost" size="sm" className="w-fit gap-1" nativeButton={false} render={<Link href={listHref} />}>
          <ArrowLeft className="size-4" /> My entries
        </Button>
        <div>
          <h2 className="section-title">Award merits</h2>
          <p className="text-sm text-muted-foreground">
            Whole-day merits for {semesterLabel}. Each award expires one year after its award date and can offset either bucket.
          </p>
        </div>
        {step !== "result" && <EntryFlowStepper step={step} ariaLabel="Award steps" />}
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
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
              <label htmlFor={ids.days} className="text-sm font-medium">Days per student</label>
              <Input id={ids.days} type="number" inputMode="numeric" min={1} max={MAX_ENTRY_DAYS} step={1} value={days}
                onChange={(e) => setDays(e.target.value)} className="h-10 font-mono" />
              <span className="text-xs text-muted-foreground">Whole days only, up to {MAX_ENTRY_DAYS}.</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={ids.date} className="text-sm font-medium">Award date</label>
              <Input id={ids.date} type="date" min={startsOn} max={latestDate} value={awardedOn}
                onChange={(e) => setAwardedOn(e.target.value)} className="h-10 font-mono" />
              <span className="text-xs text-muted-foreground">
                {awardedOn ? `Expires ${meritExpiryDate(awardedOn)}.` : `Between ${startsOn} and ${latestDate}.`}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.reason} className="text-sm font-medium">Reason</label>
            <textarea id={ids.reason} rows={4} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="What the student did to earn this merit"
              className="w-full rounded-lg border border-input bg-background p-2.5 text-sm" />
            <span className="text-right text-xs text-muted-foreground">{description.length}/500</span>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button variant="outline" onClick={() => go("students")}>Back</Button>
            <Button onClick={() => go("review")}>Review award</Button>
          </div>
        </Card>
      )}

      {step === "review" && (
        <Card className="flex flex-col gap-5 p-4 sm:p-6">
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div><dt className="text-muted-foreground">Days per student</dt><dd className="font-semibold">{plural(dayCount, "day")}</dd></div>
            <div><dt className="text-muted-foreground">Award date</dt><dd className="font-mono">{awardedOn}</dd></div>
            <div><dt className="text-muted-foreground">Expires</dt><dd className="font-mono">{meritExpiryDate(awardedOn)}</dd></div>
            <div className="sm:col-span-3"><dt className="text-muted-foreground">Reason</dt><dd className="whitespace-pre-wrap">{description.trim()}</dd></div>
          </dl>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">{plural(picked.length, "student")}</p>
            <ul className="divide-y divide-border/60 rounded-lg border border-border text-sm">
              {picked.map((p) => <li key={p.studentId} className="px-3 py-2">{label(p.studentId)}</li>)}
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">
            Each student is notified in Florence. Awards cannot be edited after they are recorded.
            {locked && " Details stay fixed so confirming again cannot repeat recorded awards; start over to change them."}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            {locked
              ? <Button variant="outline" onClick={startOver} disabled={isPending}>Start over</Button>
              : <Button variant="outline" onClick={() => go("details")} disabled={isPending}>Back</Button>}
            <Button onClick={confirm} disabled={isPending} className="gap-2">
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <Award className="size-4" />}
              {isPending ? "Recording awards…" : awardLabel}
            </Button>
          </div>
        </Card>
      )}

      {step === "result" && result && (
        <EntryFlowResultCard
          success={result.success}
          succeededIds={result.awardedIds}
          failures={result.success ? [] : result.failures}
          successText={`Awarded ${plural(dayCount, "day")} to ${plural(result.awardedIds.length, "student")}`}
          retryableCount={result.success ? 0 : picked.length}
          listHref={listHref}
          listLabel="View my entries"
          recordMoreLabel="Award more"
          labelOf={label}
          onRetry={() => setStep("review")}
          onStartOver={startOver}
        />
      )}
    </div>
  );
}
