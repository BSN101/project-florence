"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Award, CircleAlert, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { sortName } from "@/lib/format-name";
import { formatManilaDate } from "@/lib/manila-date";

import { awardExternalCiMeritsAction } from "../actions";
import { reconcileBatchOutcome, type PickedRecipient } from "../batch-retry";
import { meritExpiryDate } from "../calculations";
import type { AwardExternalCiMeritsResult, AwardRecipientOption } from "../contracts";
import {
  awardExternalCiMeritsSchema,
  MAX_ENTRY_DAYS,
  meritDaysSchema,
  meritDescriptionSchema,
} from "../schemas";
import {
  computeLatestManilaDate,
  EntryFlowResultCard,
  EntryFlowStepper,
  StudentPickerStep,
  plural,
  type EntryFlowStep,
} from "./entry-flow-shared";

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
  const [step, setStep] = useState<EntryFlowStep>("students");
  const [picked, setPicked] = useState<PickedRecipient[]>([]);
  const [search, setSearch] = useState("");
  const [externalSource, setExternalSource] = useState("");
  const [days, setDays] = useState("1");
  const [awardedOn, setAwardedOn] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AwardExternalCiMeritsResult | null>(null);
  // Students recorded across every attempt of this batch, so a retry does not hide earlier successes.
  const [succeededIds, setSucceededIds] = useState<string[]>([]);
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

  const resetState = useCallback(() => {
    setPicked([]);
    setSearch("");
    setExternalSource("");
    setDays("1");
    setAwardedOn("");
    setDescription("");
    setError(null);
    setResult(null);
    setSucceededIds([]);
    setLocked(false);
    setHadTransportUncertainty(false);
    setStep("students");
  }, []);

  // A preserved route hidden under <Activity> runs effect cleanup: leave no stale result or locked step behind.
  useEffect(() => resetState, [resetState]);

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
    const sourceCheck = awardExternalCiMeritsSchema.shape.externalSource.safeParse(externalSource);
    if (!sourceCheck.success) return sourceCheck.error.issues[0].message;
    const daysCheck = meritDaysSchema.safeParse(days);
    if (!daysCheck.success) return daysCheck.error.issues[0].message;
    if (!awardedOn || awardedOn < startsOn || awardedOn > latestDate) {
      return `The award date must be between ${formatManilaDate(startsOn)} and ${formatManilaDate(latestDate)}.`;
    }
    const reasonCheck = meritDescriptionSchema.safeParse(description);
    return reasonCheck.success ? null : reasonCheck.error.issues[0].message;
  }

  function go(next: EntryFlowStep) {
    if (next === "details") {
      if (!picked.length) {
        setError("Select at least one student.");
        return;
      }
      if (!awardedOn) {
        const latest = computeLatestManilaDate(endsOn);
        if (latest >= startsOn) setAwardedOn(latest);
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

    const wasLocked = locked;
    setPicked(preparedRecipients);

    startTransition(async () => {
      try {
        const outcome = await awardExternalCiMeritsAction(parsed.data);
        const reconciled = reconcileBatchOutcome({
          preparedRecipients,
          success: outcome.success,
          succeededIds: outcome.awardedIds,
          failures: outcome.success ? [] : outcome.failures,
          error: outcome.success ? undefined : outcome.error,
          wasLocked,
          previousSucceededIds: wasLocked ? succeededIds : [],
        });

        setPicked(reconciled.picked);
        setLocked(reconciled.locked);

        if (reconciled.kind === "pre_rpc_error") {
          setError(reconciled.error);
          return;
        }

        setHadTransportUncertainty(reconciled.hadTransportUncertainty);
        setSucceededIds(reconciled.succeededIds);
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

  const latestDate = step === "details" ? computeLatestManilaDate(endsOn) : endsOn;
  const semesterNotStarted = step === "details" && latestDate < startsOn;
  const dayCount = Number(days) || 0;
  const awardLabel = `Record ${plural(dayCount, "day")} for ${plural(picked.length, "student")}`;

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
          <EntryFlowStepper step={step} ariaLabel="External merit steps" />
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
              className="h-10 max-sm:min-h-11 pointer-coarse:min-h-11 pointer-coarse:text-base"
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
                max={MAX_ENTRY_DAYS}
                step={1}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="h-10 font-mono tabular-nums max-sm:min-h-11 pointer-coarse:min-h-11 pointer-coarse:text-base"
              />
              <span className="text-xs text-muted-foreground">Whole days only, up to {MAX_ENTRY_DAYS}.</span>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor={ids.date} className="text-sm font-medium">
                Award date
              </label>
              <Input
                id={ids.date}
                type="date"
                min={semesterNotStarted ? undefined : startsOn}
                max={semesterNotStarted ? undefined : latestDate}
                disabled={semesterNotStarted}
                value={awardedOn}
                onChange={(e) => setAwardedOn(e.target.value)}
                className="h-10 font-mono max-sm:min-h-11 pointer-coarse:min-h-11 pointer-coarse:text-base"
              />
              <span className="text-xs text-muted-foreground">
                {semesterNotStarted
                  ? `Entries can be recorded once ${semesterLabel} starts on ${formatManilaDate(startsOn)}.`
                  : awardedOn
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
              disabled={semesterNotStarted}
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
        <EntryFlowResultCard
          success={result.success}
          succeededIds={succeededIds}
          failures={result.success ? [] : result.failures}
          successText={`Recorded ${plural(dayCount, "day")} for ${plural(succeededIds.length, "student")}`}
          retryableCount={locked ? picked.length : 0}
          listHref={listHref}
          listLabel="View external CI records"
          recordMoreLabel="Record more merits"
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
