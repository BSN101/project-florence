"use client";

import Link from "next/link";
import { useId, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Award, Check, CircleAlert, Loader2, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { sortName } from "@/lib/format-name";
import { formatManilaDate } from "@/lib/manila-date";
import { cn } from "@/lib/utils";

import { awardExternalCiMeritsAction } from "../actions";
import { getTodayManila, meritExpiryDate } from "../calculations";
import type { AwardExternalCiMeritsResult, AwardRecipientOption } from "../contracts";
import { awardExternalCiMeritsSchema, meritDaysSchema, meritDescriptionSchema } from "../schemas";

type Step = "students" | "details" | "review" | "result";
type Picked = { studentId: string; requestKey: string | null };

const STEPS: { id: Exclude<Step, "result">; label: string }[] = [
  { id: "students", label: "Students" },
  { id: "details", label: "Details" },
  { id: "review", label: "Review" },
];
const MATCH_LIMIT = 20;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export function RecordExternalCiMeritsFlow({
  students,
  semesterLabel,
  startsOn,
  endsOn,
  listHref,
}: {
  students: AwardRecipientOption[];
  semesterLabel: string;
  startsOn: string;
  endsOn: string;
  listHref: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [step, setStep] = useState<Step>("students");
  const [picked, setPicked] = useState<Picked[]>([]);
  const [search, setSearch] = useState("");
  const [externalSource, setExternalSource] = useState("");
  const [days, setDays] = useState("1");
  const [awardedOn, setAwardedOn] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AwardExternalCiMeritsResult | null>(null);
  const [locked, setLocked] = useState(false);
  const [hadTransportUncertainty, setHadTransportUncertainty] = useState(false);
  const [isPending, startTransition] = useTransition();

  const ids = {
    search: useId(),
    externalSource: useId(),
    days: useId(),
    date: useId(),
    reason: useId(),
  };

  function resetState() {
    setPicked([]);
    setSearch("");
    setExternalSource("");
    setDays("1");
    setAwardedOn("");
    setDescription("");
    setError(null);
    setResult(null);
    setLocked(false);
    setHadTransportUncertainty(false);
    setStep("students");
  }

  // Preserved routes keep state under <Activity>: reset transient flow state on route or semester change.
  const locationKey = `${pathname}:${semesterLabel}`;
  const [seenLocation, setSeenLocation] = useState(locationKey);
  if (seenLocation !== locationKey && !isPending) {
    setSeenLocation(locationKey);
    resetState();
  }

  const byId = useMemo(() => new Map(students.map((s) => [s.student_id, s])), [students]);
  const pickedIds = new Set(picked.map((p) => p.studentId));
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? students.filter(
          (s) =>
            sortName(s).toLowerCase().includes(q) ||
            s.university_id.toLowerCase().includes(q)
        )
      : students;
  }, [students, search]);

  const label = (id: string) => {
    const s = byId.get(id);
    return s ? `${sortName(s)} · ${s.university_id}` : "Student";
  };

  function computeLatestDate(): string {
    const today = getTodayManila();
    return endsOn < today ? endsOn : today;
  }

  function toggle(studentId: string) {
    if (locked) return;
    setError(null);
    setPicked((prev) =>
      prev.some((p) => p.studentId === studentId)
        ? prev.filter((p) => p.studentId !== studentId)
        : [...prev, { studentId, requestKey: null }]
    );
  }

  function detailsError(latestDate: string): string | null {
    const trimmedSource = externalSource.trim();
    if (trimmedSource.length < 2 || trimmedSource.length > 120) {
      return "External CI name must be between 2 and 120 characters.";
    }
    const daysCheck = meritDaysSchema.safeParse(days);
    if (!daysCheck.success) return daysCheck.error.issues[0].message;
    if (!awardedOn || awardedOn < startsOn || awardedOn > latestDate) {
      return `The award date must be between ${formatManilaDate(startsOn)} and ${formatManilaDate(latestDate)}.`;
    }
    const reasonCheck = meritDescriptionSchema.safeParse(description);
    return reasonCheck.success ? null : reasonCheck.error.issues[0].message;
  }

  function go(next: Step) {
    if (next === "details") {
      if (!picked.length) {
        setError("Select at least one student.");
        return;
      }
      if (!awardedOn) {
        const latest = computeLatestDate();
        setAwardedOn(latest >= startsOn ? latest : startsOn);
      }
      setError(null);
      setStep("details");
      window.scrollTo({ top: 0 });
      return;
    }

    if (next === "review") {
      const problem = detailsError(computeLatestDate());
      setError(problem);
      if (problem) return;
    } else {
      setError(null);
    }

    setStep(next);
    window.scrollTo({ top: 0 });
  }

  function confirm() {
    setError(null);
    const preparedRecipients = picked.map((p) => ({
      studentId: p.studentId,
      requestKey: p.requestKey ?? crypto.randomUUID(),
    }));

    const parsed = awardExternalCiMeritsSchema.safeParse({
      recipients: preparedRecipients,
      externalSource,
      days: Number(days),
      awardedOn,
      description,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the external CI merit details.");
      return;
    }

    setPicked(preparedRecipients);

    startTransition(async () => {
      try {
        const outcome = await awardExternalCiMeritsAction(parsed.data);
        if (!outcome.success && !outcome.awardedIds.length && !outcome.failures.length) {
          // No per-recipient RPC was attempted; release lazy keys so edits remain safe.
          setPicked((prev) => prev.map((p) => ({ studentId: p.studentId, requestKey: null })));
          setError(outcome.error);
          return;
        }

        if (outcome.success) {
          setPicked([]);
          setLocked(false);
          setHadTransportUncertainty(false);
          setResult(outcome);
          setStep("result");
          window.scrollTo({ top: 0 });
          return;
        }

        const retryableIds = new Set(
          outcome.failures.filter((f) => f.retryable).map((f) => f.studentId)
        );
        const remaining = preparedRecipients
          .filter((p) => !outcome.awardedIds.includes(p.studentId))
          .map((p) => ({
            studentId: p.studentId,
            requestKey: retryableIds.has(p.studentId) ? p.requestKey : null,
          }));

        setPicked(remaining);
        setLocked(retryableIds.size > 0);
        if (retryableIds.size > 0) setHadTransportUncertainty(true);
        setResult(outcome);
        setStep("result");
        window.scrollTo({ top: 0 });
      } catch {
        setLocked(true);
        setHadTransportUncertainty(true);
        setError(
          "Unable to reach the server. Some merits may have been recorded; confirming again will safely skip any already recorded."
        );
      }
    });
  }

  function startOver() {
    const shouldRefresh = hadTransportUncertainty;
    resetState();
    if (shouldRefresh) {
      router.refresh();
    }
  }

  const latestDate = step === "details" ? computeLatestDate() : endsOn;
  const dayCount = Number(days) || 0;
  const awardLabel = `Record ${plural(dayCount, "day")} for ${plural(picked.length, "student")}`;
  const hasRetryableRemaining = Boolean(
    result && !result.success && result.failures.some((f) => f.retryable) && picked.length > 0
  );

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-4">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit gap-2 max-sm:min-h-11 pointer-coarse:min-h-11"
          nativeButton={false}
          render={<Link href={listHref} />}
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> External CI records
        </Button>
        <div>
          <h2 className="section-title">Record external CI merits</h2>
          <p className="text-sm text-muted-foreground">
            Externally attributed whole-day merits for {semesterLabel}. Each unit expires one year
            after its award date and can offset either bucket.
          </p>
        </div>
        {step !== "result" && (
          <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label="External merit steps">
            {STEPS.map((item, index) => {
              const current = STEPS.findIndex((s) => s.id === step);
              return (
                <li
                  key={item.id}
                  aria-current={index === current ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-2",
                    index === current ? "font-medium text-foreground" : "text-muted-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full border text-xs tabular-nums",
                      index < current
                        ? "border-primary bg-primary text-primary-foreground"
                        : index === current
                        ? "border-primary text-primary"
                        : "border-border"
                    )}
                  >
                    {index < current ? <Check className="size-4" aria-hidden="true" /> : index + 1}
                  </span>
                  {item.label}
                  {index < STEPS.length - 1 && (
                    <span aria-hidden="true" className="h-px w-6 bg-border" />
                  )}
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
          <CircleAlert className="mt-1 size-4 shrink-0" aria-hidden="true" />
          <span className="whitespace-normal break-words">{error}</span>
        </p>
      )}

      {step === "students" && (
        <Card className="flex w-full flex-col gap-4 p-4 sm:p-6">
          <div className="flex flex-col gap-2">
            <label htmlFor={ids.search} className="text-sm font-medium">
              Find active enrolled students
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id={ids.search}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or student number"
                className="h-10 pl-9 max-sm:min-h-11 pointer-coarse:min-h-11"
              />
            </div>
          </div>

          {picked.length > 0 && (
            <div className="flex flex-wrap gap-2" aria-label="Selected students">
              {picked.map((p) => (
                <span
                  key={p.studentId}
                  className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 py-1 pl-3 pr-1 text-xs"
                >
                  <span>{label(p.studentId)}</span>
                  <button
                    type="button"
                    onClick={() => toggle(p.studentId)}
                    aria-label={`Remove ${label(p.studentId)}`}
                    className="flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground max-sm:min-h-11 max-sm:min-w-11 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <ul className="divide-y divide-border/60 rounded-lg border border-border">
            {matches.length === 0 && (
              <li className="p-4 text-center text-sm text-muted-foreground">
                {students.length
                  ? "No active students match this search."
                  : "No active students are enrolled in the current semester."}
              </li>
            )}
            {matches.slice(0, MATCH_LIMIT).map((s) => {
              const selected = pickedIds.has(s.student_id);
              const studentLabel = `${sortName(s)} · ${s.university_id}`;
              return (
                <li key={s.student_id}>
                  <button
                    type="button"
                    onClick={() => toggle(s.student_id)}
                    aria-pressed={selected}
                    aria-label={`${selected ? "Deselect" : "Select"} ${studentLabel}`}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                      selected ? "bg-primary/10" : "hover:bg-muted/50"
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded border",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/40"
                      )}
                    >
                      {selected && <Check className="size-4" aria-hidden="true" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{sortName(s)}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {s.university_id}
                    </span>
                    <span className="text-xs text-muted-foreground max-sm:hidden">
                      Year {s.year_level}
                    </span>
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
            <Button
              onClick={() => go("details")}
              className="max-sm:w-full max-sm:min-h-11 pointer-coarse:min-h-11"
            >
              Continue with {plural(picked.length, "student")}
            </Button>
          </div>
        </Card>
      )}

      {step === "details" && (
        <Card className="flex w-full flex-col gap-4 p-4 sm:p-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor={ids.externalSource} className="text-sm font-medium">
                External CI / source name
              </label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {externalSource.length}/120
              </span>
            </div>
            <Input
              id={ids.externalSource}
              type="text"
              maxLength={120}
              value={externalSource}
              onChange={(e) => setExternalSource(e.target.value)}
              placeholder="Name of the external clinical instructor or partner source"
              className="h-10 max-sm:min-h-11 pointer-coarse:min-h-11"
            />
            <span className="text-xs text-muted-foreground">
              Required (2 to 120 characters). Recorded with your name as the entering RLE Coordinator.
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label htmlFor={ids.days} className="text-sm font-medium">
                Days per student
              </label>
              <Input
                id={ids.days}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="h-10 font-mono tabular-nums max-sm:min-h-11 pointer-coarse:min-h-11"
              />
              <span className="text-xs text-muted-foreground">Whole days only.</span>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor={ids.date} className="text-sm font-medium">
                Award date
              </label>
              <Input
                id={ids.date}
                type="date"
                min={startsOn}
                max={latestDate}
                value={awardedOn}
                onChange={(e) => setAwardedOn(e.target.value)}
                className="h-10 font-mono max-sm:min-h-11 pointer-coarse:min-h-11"
              />
              <span className="text-xs text-muted-foreground">
                {awardedOn
                  ? `Expires ${formatManilaDate(meritExpiryDate(awardedOn))}.`
                  : `Between ${formatManilaDate(startsOn)} and ${formatManilaDate(latestDate)}.`}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor={ids.reason} className="text-sm font-medium">
                Reason
              </label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {description.length}/500
              </span>
            </div>
            <textarea
              id={ids.reason}
              rows={4}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What the student did to earn this external CI merit"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
            />
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button
              variant="outline"
              onClick={() => go("students")}
              className="max-sm:min-h-11 pointer-coarse:min-h-11"
            >
              Back
            </Button>
            <Button
              onClick={() => go("review")}
              className="max-sm:min-h-11 pointer-coarse:min-h-11"
            >
              Review external merit
            </Button>
          </div>
        </Card>
      )}

      {step === "review" && (
        <Card className="flex w-full flex-col gap-6 p-4 sm:p-6">
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div className="sm:col-span-3">
              <dt className="text-muted-foreground">External CI</dt>
              <dd className="whitespace-normal break-words font-medium text-foreground">
                {externalSource.trim()}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Days per student</dt>
              <dd className="font-medium tabular-nums">{plural(dayCount, "day")}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Award date</dt>
              <dd>{formatManilaDate(awardedOn)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Expires</dt>
              <dd>{formatManilaDate(meritExpiryDate(awardedOn))}</dd>
            </div>
            <div className="sm:col-span-3">
              <dt className="text-muted-foreground">Reason</dt>
              <dd className="whitespace-normal break-words">{description.trim()}</dd>
            </div>
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
            Each student is notified in Florence. External CI merits cannot be edited after they are
            recorded.
            {locked &&
              " Details stay fixed so confirming again cannot repeat recorded merits; start over to change them."}
          </p>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            {locked ? (
              <Button
                variant="outline"
                onClick={startOver}
                disabled={isPending}
                className="max-sm:min-h-11 pointer-coarse:min-h-11"
              >
                Start over
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => go("details")}
                disabled={isPending}
                className="max-sm:min-h-11 pointer-coarse:min-h-11"
              >
                Back
              </Button>
            )}
            <Button
              onClick={confirm}
              disabled={isPending}
              className="gap-2 max-sm:min-h-11 pointer-coarse:min-h-11"
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Award className="size-4" aria-hidden="true" />
              )}
              {isPending ? "Recording external merits…" : awardLabel}
            </Button>
          </div>
        </Card>
      )}

      {step === "result" && result && (
        <Card className="flex w-full flex-col gap-6 p-4 sm:p-6" role="status">
          {result.awardedIds.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-2 font-medium text-emerald-700">
                <Check className="size-4 shrink-0" aria-hidden="true" />
                <span>
                  Recorded {plural(dayCount, "day")} for {plural(result.awardedIds.length, "student")}
                </span>
              </p>
              <ul className="divide-y divide-border/60 rounded-lg border border-border text-sm">
                {result.awardedIds.map((id) => (
                  <li key={id} className="px-3 py-2">
                    {label(id)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!result.success && (
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-2 font-medium text-destructive">
                <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
                <span>Not recorded for {plural(result.failures.length, "student")}</span>
              </p>
              <ul className="divide-y divide-border/60 rounded-lg border border-border text-sm">
                {result.failures.map((f) => (
                  <li key={f.studentId} className="flex flex-col gap-1 px-3 py-2">
                    <span>{label(f.studentId)}</span>
                    <span className="whitespace-normal break-words text-xs text-muted-foreground">
                      {f.error}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={listHref} />}
              className="max-sm:min-h-11 pointer-coarse:min-h-11"
            >
              View external CI records
            </Button>
            {hasRetryableRemaining ? (
              <Button
                onClick={() => setStep("review")}
                className="max-sm:min-h-11 pointer-coarse:min-h-11"
              >
                Retry {plural(picked.length, "remaining student")}
              </Button>
            ) : (
              <Button
                onClick={startOver}
                className="max-sm:min-h-11 pointer-coarse:min-h-11"
              >
                {result.success ? "Record more merits" : "Start over"}
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
