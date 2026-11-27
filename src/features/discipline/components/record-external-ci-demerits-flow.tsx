"use client";

import Link from "next/link";
import { useId, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, CircleAlert, FileWarning, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { sortName } from "@/lib/format-name";
import { formatManilaDate } from "@/lib/manila-date";

import { logExternalCiDemeritsAction } from "../actions";
import type {
  AwardRecipientOption,
  LogExternalCiDemeritsResult,
  MisconductOption,
} from "../contracts";
import { demeritDaysSchema, logExternalCiDemeritsSchema } from "../schemas";
import {
  computeLatestManilaDate,
  ExternalCiFlowResultCard,
  ExternalCiFlowStepper,
  ExternalCiStudentPickerStep,
  plural,
  reconcileBatchOutcome,
  type ExternalCiFlowStep,
  type PickedRecipient,
} from "./external-ci-flow-shared";

export function RecordExternalCiDemeritsFlow({
  students,
  misconductOptions,
  semesterLabel,
  startsOn,
  endsOn,
  listHref,
}: {
  students: AwardRecipientOption[];
  misconductOptions: MisconductOption[];
  semesterLabel: string;
  startsOn: string;
  endsOn: string;
  listHref: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [step, setStep] = useState<ExternalCiFlowStep>("students");
  const [picked, setPicked] = useState<PickedRecipient[]>([]);
  const [search, setSearch] = useState("");
  const [externalSource, setExternalSource] = useState("");
  const [misconductId, setMisconductId] = useState<string>(() => misconductOptions[0]?.id ?? "");
  const [days, setDays] = useState("1");
  const [incidentOn, setIncidentOn] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LogExternalCiDemeritsResult | null>(null);
  const [locked, setLocked] = useState(false);
  const [hadTransportUncertainty, setHadTransportUncertainty] = useState(false);
  const [isPending, startTransition] = useTransition();

  const ids = {
    search: useId(),
    externalSource: useId(),
    misconduct: useId(),
    days: useId(),
    date: useId(),
    notes: useId(),
  };

  function resetState() {
    setPicked([]);
    setSearch("");
    setExternalSource("");
    setMisconductId(misconductOptions[0]?.id ?? "");
    setDays("1");
    setIncidentOn("");
    setNotes("");
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
  const label = (id: string) => {
    const s = byId.get(id);
    return s ? `${sortName(s)} · ${s.university_id}` : "Student";
  };

  const selectedMisconduct = useMemo(
    () => misconductOptions.find((m) => m.id === misconductId) ?? misconductOptions[0],
    [misconductOptions, misconductId]
  );
  const effectiveMisconductId = selectedMisconduct?.id ?? "";
  const isOther = Boolean(selectedMisconduct?.is_other);
  const hasMisconductOptions = misconductOptions.length > 0;

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
    if (latestDate < startsOn) {
      return `Entries can be recorded once ${semesterLabel} starts on ${formatManilaDate(startsOn)}.`;
    }
    if (!hasMisconductOptions || !effectiveMisconductId) {
      return "No active misconduct options are available. Ask a Platform Admin to configure the catalog first.";
    }
    const sourceCheck = logExternalCiDemeritsSchema.shape.externalSource.safeParse(externalSource);
    if (!sourceCheck.success) return sourceCheck.error.issues[0].message;
    const daysCheck = demeritDaysSchema.safeParse(days);
    if (!daysCheck.success) return daysCheck.error.issues[0].message;
    if (!incidentOn || incidentOn < startsOn || incidentOn > latestDate) {
      return `The incident date must be between ${formatManilaDate(startsOn)} and ${formatManilaDate(latestDate)}.`;
    }
    if (isOther && notes.trim().length < 3) {
      return "Describe the specific misconduct when selecting Other (at least 3 characters).";
    }
    if (notes.length > 500) {
      return "Notes cannot exceed 500 characters.";
    }
    return null;
  }

  function go(next: ExternalCiFlowStep) {
    if (next === "details") {
      if (!picked.length) {
        setError("Select at least one student.");
        return;
      }
      if (!incidentOn) {
        const latest = computeLatestManilaDate(endsOn);
        if (latest >= startsOn) setIncidentOn(latest);
      }
      setError(null);
      setStep("details");
      window.scrollTo({ top: 0 });
      return;
    }

    if (next === "review") {
      const problem = detailsError(computeLatestManilaDate(endsOn));
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

    const parsed = logExternalCiDemeritsSchema.safeParse({
      recipients: preparedRecipients,
      externalSource,
      misconductId: effectiveMisconductId,
      isOther,
      days: Number(days),
      incidentOn,
      notes,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the external CI demerit details.");
      return;
    }

    const wasLocked = locked;
    setPicked(preparedRecipients);

    startTransition(async () => {
      try {
        const outcome = await logExternalCiDemeritsAction(parsed.data);
        const reconciled = reconcileBatchOutcome({
          preparedRecipients,
          success: outcome.success,
          succeededIds: outcome.recordedIds,
          failures: outcome.success ? [] : outcome.failures,
          error: outcome.success ? undefined : outcome.error,
          wasLocked,
        });

        setPicked(reconciled.picked);
        setLocked(reconciled.locked);

        if (reconciled.kind === "pre_rpc_error") {
          setError(reconciled.error);
          return;
        }

        setHadTransportUncertainty(reconciled.hadTransportUncertainty);
        setResult(outcome);
        setStep("result");
        window.scrollTo({ top: 0 });
      } catch {
        setLocked(true);
        setHadTransportUncertainty(true);
        setError(
          "Unable to reach the server. Some demerits may have been recorded; confirming again will safely skip any already recorded."
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

  const latestDate = step === "details" ? computeLatestManilaDate(endsOn) : endsOn;
  const semesterNotStarted = step === "details" && latestDate < startsOn;
  const dayCount = Number(days) || 0;
  const demeritLabel = `Record ${plural(dayCount, "day")} for ${plural(picked.length, "student")}`;

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
          <h2 className="section-title">Record external CI demerits</h2>
          <p className="text-sm text-muted-foreground">
            Externally attributed whole-day RLE demerits for {semesterLabel}. Multi-day entries
            create individual 1-day units sharing the incident context.
          </p>
        </div>
        {step !== "result" && (
          <ExternalCiFlowStepper step={step} ariaLabel="External demerit steps" />
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
        <ExternalCiStudentPickerStep
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
        <Card className="flex w-full flex-col gap-4 p-4 sm:p-6">
          {!hasMisconductOptions && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <CircleAlert className="mt-1 size-4 shrink-0" aria-hidden="true" />
              <span>
                No active misconduct options are available. Ask a Platform Admin to configure the
                misconduct catalog before logging external CI demerits.
              </span>
            </p>
          )}

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
              className="h-10 max-sm:min-h-11 pointer-coarse:min-h-11 pointer-coarse:text-base"
            />
            <span className="text-xs text-muted-foreground">
              Required (2 to 120 characters). Only you, as the entering RLE Coordinator, may waive
              these units later.
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Applicable bucket</span>
              <div className="flex h-10 items-center rounded-lg border border-input bg-muted/30 px-3 text-sm font-medium max-sm:min-h-11 pointer-coarse:min-h-11">
                <span>RLE</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  (external CI demerits apply to RLE)
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor={ids.misconduct} className="text-sm font-medium">
                Misconduct violation
              </label>
              <select
                id={ids.misconduct}
                value={effectiveMisconductId}
                disabled={!hasMisconductOptions}
                onChange={(e) => setMisconductId(e.target.value)}
                className="h-10 rounded-lg border border-input bg-background px-3 text-base text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-75 md:text-sm pointer-coarse:text-base max-sm:min-h-11 pointer-coarse:min-h-11"
              >
                {!hasMisconductOptions && <option value="">No active options</option>}
                {misconductOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
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
                className="h-10 font-mono tabular-nums max-sm:min-h-11 pointer-coarse:min-h-11 pointer-coarse:text-base"
              />
              <span className="text-xs text-muted-foreground">Whole days only. Defaults to 1.</span>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor={ids.date} className="text-sm font-medium">
                Incident date
              </label>
              <Input
                id={ids.date}
                type="date"
                min={semesterNotStarted ? undefined : startsOn}
                max={semesterNotStarted ? undefined : latestDate}
                disabled={semesterNotStarted}
                value={incidentOn}
                onChange={(e) => setIncidentOn(e.target.value)}
                className="h-10 font-mono max-sm:min-h-11 pointer-coarse:min-h-11 pointer-coarse:text-base"
              />
              <span className="text-xs text-muted-foreground">
                {semesterNotStarted
                  ? `Entries can be recorded once ${semesterLabel} starts on ${formatManilaDate(startsOn)}.`
                  : `Between ${formatManilaDate(startsOn)} and ${formatManilaDate(latestDate)}.`}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor={ids.notes} className="text-sm font-medium">
                {isOther ? "Incident description (required)" : "Additional details (optional)"}
              </label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {notes.length}/500
              </span>
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
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm pointer-coarse:text-base"
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
              disabled={semesterNotStarted || !hasMisconductOptions}
              className="max-sm:min-h-11 pointer-coarse:min-h-11"
            >
              Review external demerit
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
              <dt className="text-muted-foreground">Applicable bucket</dt>
              <dd className="font-medium tracking-wider">RLE</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Days per student</dt>
              <dd className="font-medium tabular-nums">{plural(dayCount, "day")}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Incident date</dt>
              <dd>{formatManilaDate(incidentOn)}</dd>
            </div>
            <div className="sm:col-span-3">
              <dt className="text-muted-foreground">Violation</dt>
              <dd className="whitespace-normal break-words font-medium text-foreground">
                {selectedMisconduct?.label}
              </dd>
            </div>
            {notes.trim() && (
              <div className="sm:col-span-3">
                <dt className="text-muted-foreground">Description / Notes</dt>
                <dd className="whitespace-normal break-words">{notes.trim()}</dd>
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
            Each student is notified in Florence. External CI demerits cannot be edited after they
            are recorded.
            {locked &&
              " Details stay fixed so confirming again cannot repeat recorded demerits; start over to change them."}
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
                <FileWarning className="size-4" aria-hidden="true" />
              )}
              {isPending ? "Recording external demerits…" : demeritLabel}
            </Button>
          </div>
        </Card>
      )}

      {step === "result" && result && (
        <ExternalCiFlowResultCard
          success={result.success}
          succeededIds={result.recordedIds}
          failures={result.success ? [] : result.failures}
          dayCount={dayCount}
          retryableCount={locked ? picked.length : 0}
          listHref={listHref}
          recordMoreLabel="Record more demerits"
          labelOf={label}
          onRetry={() => {
            setStep("review");
            window.scrollTo({ top: 0 });
          }}
          onStartOver={startOver}
        />
      )}
    </div>
  );
}
