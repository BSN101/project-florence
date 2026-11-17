"use client";

import Link from "next/link";
import { useId, useMemo, useState, useTransition } from "react";
import { ArrowLeft, Award, Check, CircleAlert, Loader2, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { sortName } from "@/lib/format-name";
import { cn } from "@/lib/utils";
import { awardDirectMeritsAction, type AwardDirectMeritsResult } from "../actions";
import { meritExpiryDate } from "../calculations";
import type { AwardRecipientOption } from "../contracts";
import { meritDaysSchema, meritDescriptionSchema } from "../schemas";

type Step = "students" | "details" | "review" | "result";
/** `requestKey` is made when the student is picked, so a retry of the same award replays instead of repeating it. */
type Picked = { studentId: string; requestKey: string };

const STEPS: { id: Exclude<Step, "result">; label: string }[] = [
  { id: "students", label: "Students" },
  { id: "details", label: "Details" },
  { id: "review", label: "Review" },
];
// Matches render in the page flow (no inner scroll box), so long rosters are narrowed by search.
const MATCH_LIMIT = 20;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

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
  const pickedIds = new Set(picked.map((p) => p.studentId));
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? students.filter((s) => sortName(s).toLowerCase().includes(q) || s.university_id.toLowerCase().includes(q)) : students;
  }, [students, search]);
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
        {step !== "result" && (
          <ol className="flex items-center gap-2 text-sm" aria-label="Award steps">
            {STEPS.map((item, index) => {
              const current = STEPS.findIndex((s) => s.id === step);
              return (
                <li key={item.id} aria-current={index === current ? "step" : undefined}
                  className={cn("flex items-center gap-2", index === current ? "font-semibold text-foreground" : "text-muted-foreground")}>
                  <span className={cn("flex size-6 items-center justify-center rounded-full border text-xs",
                    index < current ? "border-primary bg-primary text-primary-foreground"
                      : index === current ? "border-primary text-primary" : "border-border")}>
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
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" /> {error}
        </p>
      )}

      {step === "students" && (
        <Card className="flex flex-col gap-4 p-4 sm:p-6">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.search} className="text-sm font-medium">Find enrolled students</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id={ids.search} type="search" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or student number" className="h-10 pl-8" />
            </div>
          </div>

          {picked.length > 0 && (
            <div className="flex flex-wrap gap-1.5" aria-label="Selected students">
              {picked.map((p) => (
                <span key={p.studentId} className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs">
                  {label(p.studentId)}
                  <button type="button" onClick={() => toggle(p.studentId)} aria-label={`Remove ${label(p.studentId)}`}
                    className="flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <ul className="divide-y divide-border/60 rounded-lg border border-border">
            {matches.length === 0 && (
              <li className="p-4 text-center text-sm text-muted-foreground">
                {students.length ? "No students match this search." : "No students are enrolled in the current semester."}
              </li>
            )}
            {matches.slice(0, MATCH_LIMIT).map((s) => {
              const selected = pickedIds.has(s.student_id);
              return (
                <li key={s.student_id}>
                  <button type="button" onClick={() => toggle(s.student_id)} aria-pressed={selected}
                    className={cn("flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors",
                      selected ? "bg-primary/10" : "hover:bg-muted/50")}>
                    <span className={cn("flex size-5 shrink-0 items-center justify-center rounded border",
                      selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")}>
                      {selected && <Check className="size-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{sortName(s)}</span>
                    <span className="font-mono text-xs text-muted-foreground">{s.university_id}</span>
                    <span className="text-xs text-muted-foreground max-sm:hidden">Year {s.year_level}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {matches.length > MATCH_LIMIT && (
            <p className="text-xs text-muted-foreground">
              Showing {MATCH_LIMIT} of {matches.length}. Search by name or number to find others.
            </p>
          )}

          <div className="flex justify-end">
            <Button onClick={() => go("details")} className="max-sm:w-full">
              Continue with {plural(picked.length, "student")}
            </Button>
          </div>
        </Card>
      )}

      {step === "details" && (
        <Card className="flex flex-col gap-4 p-4 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={ids.days} className="text-sm font-medium">Days per student</label>
              <Input id={ids.days} type="number" inputMode="numeric" min={1} step={1} value={days}
                onChange={(e) => setDays(e.target.value)} className="h-10 font-mono" />
              <span className="text-xs text-muted-foreground">Whole days only.</span>
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
        <Card className="flex flex-col gap-5 p-4 sm:p-6" role="status">
          {result.awardedIds.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-400">
                <Check className="size-4" /> Awarded {plural(dayCount, "day")} to {plural(result.awardedIds.length, "student")}
              </p>
              <ul className="divide-y divide-border/60 rounded-lg border border-border text-sm">
                {result.awardedIds.map((id) => <li key={id} className="px-3 py-2">{label(id)}</li>)}
              </ul>
            </div>
          )}
          {!result.success && (
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-2 font-semibold text-destructive">
                <CircleAlert className="size-4" /> Not recorded for {plural(result.failures.length, "student")}
              </p>
              <ul className="divide-y divide-border/60 rounded-lg border border-border text-sm">
                {result.failures.map((f) => (
                  <li key={f.studentId} className="flex flex-col px-3 py-2">
                    <span>{label(f.studentId)}</span>
                    <span className="text-xs text-muted-foreground">{f.error}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" nativeButton={false} render={<Link href={listHref} />}>View my entries</Button>
            {result.success
              ? <Button onClick={startOver}>Award more</Button>
              : <Button onClick={() => setStep("review")}>Review the remaining {plural(picked.length, "student")}</Button>}
          </div>
        </Card>
      )}
    </div>
  );
}
