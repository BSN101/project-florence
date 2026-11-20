"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import {
  ArrowLeft,
  Award,
  Check,
  CheckCircle2,
  CircleAlert,
  Info,
  Loader2,
  RotateCcw,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { applyMeritsAction } from "../actions";
import type {
  AvailableMerit,
  DisciplinaryBucket,
  StudentDisciplinarySummary,
  StudentMeritApplicationGroup,
} from "../contracts";
import { BucketBadge } from "./disciplinary-badges";

type Step = "configure" | "review";

const STEPS: { id: Step; label: string }[] = [
  { id: "configure", label: "Configure" },
  { id: "review", label: "Review" },
];

const formatDays = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

const MANILA_DATETIME_FORMATTER = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  dateStyle: "medium",
  timeStyle: "short",
});

function formatManilaDateTime(iso: string | null | undefined): string {
  if (!iso) return "Recorded";
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "Recorded";
    return MANILA_DATETIME_FORMATTER.format(date);
  } catch {
    return "Recorded";
  }
}

export function ApplyMeritsFlow({
  availableMerits,
  summary,
  initialBucket,
  listHref,
}: {
  availableMerits: AvailableMerit[];
  summary: StudentDisciplinarySummary;
  initialBucket?: DisciplinaryBucket | null;
  listHref: string;
}) {
  const [step, setStep] = useState<Step>("configure");
  const [bucket, setBucket] = useState<DisciplinaryBucket | "">(() => {
    if (initialBucket === "office" && summary.office.balance > 0) return "office";
    if (initialBucket === "rle" && summary.rle.balance > 0) return "rle";
    return "";
  });
  const [days, setDays] = useState("1");
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const daysInputId = useId();

  const selectedBucketDebt =
    bucket === "office"
      ? summary.office.balance
      : bucket === "rle"
      ? summary.rle.balance
      : 0;

  const maxApplicableDays = Math.min(availableMerits.length, selectedBucketDebt);
  const parsedDays = parseInt(days, 10) || 0;

  function validateConfigure(): string | null {
    if (!bucket) {
      return "Please select a duty bucket (Office or Clinical/RLE) to offset.";
    }
    if (selectedBucketDebt <= 0) {
      return `The ${bucket.toUpperCase()} bucket currently has 0 outstanding sanctions.`;
    }
    if (!days || parsedDays < 1) {
      return "Days must be a whole number of at least 1.";
    }
    if (parsedDays > maxApplicableDays) {
      return `Days cannot exceed ${maxApplicableDays} (limited by your available merits and bucket balance).`;
    }
    return null;
  }

  function go(next: Step) {
    if (next === "review") {
      const problem = validateConfigure();
      setError(problem);
      if (problem) return;
    } else {
      setError(null);
    }
    setStep(next);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0 });
    }
  }

  function confirm() {
    if (!bucket || parsedDays < 1) return;
    setError(null);
    setLocked(true);
    startTransition(async () => {
      try {
        const res = await applyMeritsAction({
          requestKey,
          bucket,
          days: parsedDays,
        });

        // Next.js redirect() during server action navigates the client; res is undefined on redirect
        if (res && !res.success) {
          if (res.retryable) {
            setError(res.error);
            return;
          }
          // Deterministic failure (e.g. balance changed): reload current figures and let the student reconfigure.
          setLocked(false);
          setRequestKey(crypto.randomUUID());
          setStep("configure");
          setError(res.error);
          router.refresh();
        }
      } catch (err) {
        // Rethrow Next.js redirect control-flow error so navigation completes cleanly without triggering the error banner
        if (
          err instanceof Error &&
          "digest" in err &&
          typeof (err as { digest?: unknown }).digest === "string" &&
          (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
        ) {
          throw err;
        }
        setError(
          "Unable to reach the server. If your merits were applied, confirming again will not duplicate them."
        );
      }
    });
  }

  function startOver() {
    setLocked(false);
    setError(null);
    setRequestKey(crypto.randomUUID());
    setStep("configure");
  }

  const previewMerits = availableMerits.slice(0, parsedDays);

  return (
    <div className="flex flex-col gap-6">
      {/* Top Navigation & Header */}
      <div className="flex flex-col gap-3">
        <Link
          href={listHref}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-fit gap-1")}
        >
          <ArrowLeft className="size-4" /> Back to conduct ledger
        </Link>
        <div>
          <h2 className="section-title">Apply merits</h2>
          <p className="text-sm text-muted-foreground">
            Offset outstanding demerit sanctions using your earned, unexpired merits.
          </p>
        </div>

        <ol className="flex items-center gap-2 text-sm" aria-label="Application steps">
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
      </div>

      {/* Inline Error Alert */}
      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      {/* Step 1: Configure */}
      {step === "configure" && (
        <Card className="flex flex-col gap-6 p-4 sm:p-6">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Select duty bucket to offset</span>
              <span className="text-xs text-muted-foreground">
                Merits can only be applied toward buckets with an active balance.
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Office Duty Card */}
              <button
                type="button"
                disabled={summary.office.balance <= 0 || locked}
                onClick={() => {
                  setBucket("office");
                  setError(null);
                }}
                className={cn(
                  "flex flex-col justify-between rounded-lg border p-4 text-left transition-all",
                  summary.office.balance <= 0
                    ? "opacity-60 cursor-not-allowed border-border/50 bg-muted/20"
                    : bucket === "office"
                    ? "border-primary bg-primary/5 ring-1 ring-primary shadow-xs"
                    : "border-border hover:border-border/80 hover:bg-muted/40"
                )}
              >
                <div className="flex items-center justify-between pb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Office Duty
                  </span>
                  <BucketBadge bucket="office" />
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="font-heading text-xl font-semibold tracking-tight tabular-nums">
                    {formatDays(summary.office.balance)}
                  </span>
                  {summary.office.balance === 0 ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="size-3.5" />
                      Clear
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Sanction</span>
                  )}
                </div>
                {summary.office.balance <= 0 && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    No outstanding Office sanctions to offset.
                  </p>
                )}
              </button>

              {/* Clinical (RLE) Duty Card */}
              <button
                type="button"
                disabled={summary.rle.balance <= 0 || locked}
                onClick={() => {
                  setBucket("rle");
                  setError(null);
                }}
                className={cn(
                  "flex flex-col justify-between rounded-lg border p-4 text-left transition-all",
                  summary.rle.balance <= 0
                    ? "opacity-60 cursor-not-allowed border-border/50 bg-muted/20"
                    : bucket === "rle"
                    ? "border-primary bg-primary/5 ring-1 ring-primary shadow-xs"
                    : "border-border hover:border-border/80 hover:bg-muted/40"
                )}
              >
                <div className="flex items-center justify-between pb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Clinical (RLE) Duty
                  </span>
                  <BucketBadge bucket="rle" />
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="font-heading text-xl font-semibold tracking-tight tabular-nums">
                    {formatDays(summary.rle.balance)}
                  </span>
                  {summary.rle.balance === 0 ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="size-3.5" />
                      Clear
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Sanction</span>
                  )}
                </div>
                {summary.rle.balance <= 0 && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    No outstanding Clinical (RLE) sanctions to offset.
                  </p>
                )}
              </button>
            </div>
          </div>

          {/* Days to Apply Input */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label htmlFor={daysInputId} className="text-sm font-medium">
                Days to apply
              </label>
              {bucket && maxApplicableDays > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setDays(String(maxApplicableDays));
                    setError(null);
                  }}
                  disabled={locked}
                  className="text-xs font-medium text-primary hover:underline disabled:pointer-events-none disabled:opacity-50"
                >
                  Apply max ({maxApplicableDays} {maxApplicableDays === 1 ? "day" : "days"})
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Input
                id={daysInputId}
                type="number"
                inputMode="numeric"
                min={1}
                max={maxApplicableDays || undefined}
                step={1}
                value={days}
                disabled={!bucket || maxApplicableDays <= 0 || locked}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "" || /^\d+$/.test(val)) {
                    setDays(val);
                    setError(null);
                  }
                }}
                className="h-10 max-w-[140px]"
              />
              <span className="text-xs text-muted-foreground">
                {bucket
                  ? `Max: ${maxApplicableDays} ${
                      maxApplicableDays === 1 ? "day" : "days"
                    } (based on ${availableMerits.length} available merits and ${formatDays(
                      selectedBucketDebt
                    )} debt)`
                  : "Select a bucket above to specify days."}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between pt-2">
            <Link
              href={listHref}
              className={cn(buttonVariants({ variant: "outline" }), "text-sm max-sm:w-full")}
            >
              Cancel
            </Link>
            <Button
              type="button"
              disabled={
                !bucket ||
                maxApplicableDays <= 0 ||
                parsedDays < 1 ||
                parsedDays > maxApplicableDays
              }
              onClick={() => go("review")}
              className="max-sm:w-full"
            >
              Continue to review
            </Button>
          </div>
        </Card>
      )}

      {/* Step 2: Review */}
      {step === "review" && (
        <Card className="flex flex-col gap-6 p-4 sm:p-6">
          {/* Balance Breakdown: Current vs Projected */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-border/70 p-3 bg-muted/20">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {bucket === "office" ? "Office Balance" : "Clinical (RLE) Balance"}
              </span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-sm line-through text-muted-foreground tabular-nums">
                  {formatDays(selectedBucketDebt)}
                </span>
                <span className="text-lg font-semibold text-foreground tabular-nums">
                  → {formatDays(Math.max(0, selectedBucketDebt - parsedDays))}
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-border/70 p-3 bg-muted/20">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Available Merits
              </span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-sm line-through text-muted-foreground tabular-nums">
                  {formatDays(availableMerits.length)}
                </span>
                <span className="text-lg font-semibold text-foreground tabular-nums">
                  → {formatDays(Math.max(0, availableMerits.length - parsedDays))}
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-border/70 p-3 bg-muted/20">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Total Sanctions
              </span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-sm line-through text-muted-foreground tabular-nums">
                  {formatDays(summary.totalActiveBalance)}
                </span>
                <span className="text-lg font-semibold text-foreground tabular-nums">
                  → {formatDays(Math.max(0, summary.totalActiveBalance - parsedDays))}
                </span>
              </div>
            </div>
          </div>

          {/* Irreversibility Notice */}
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-200">
            <Info className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="font-semibold">Irreversible Action</p>
              <p className="mt-0.5">
                Merits applied to demerit sanctions cannot be undone or transferred to another bucket.
              </p>
            </div>
          </div>

          {/* Earliest-Expiring Units Preview */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Earliest-Expiring Merits to Apply ({previewMerits.length})
              </h3>
              <span className="text-[11px] text-muted-foreground">
                Applied in strict FIFO order by expiry date
              </span>
            </div>

            <div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border text-xs">
              {previewMerits.map((m, idx) => (
                <div
                  key={m.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 p-3"
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <span className="font-mono text-muted-foreground shrink-0">#{idx + 1}</span>
                    <span className="font-medium text-foreground truncate">{m.description}</span>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground shrink-0 text-[11px]">
                    <span>Awarded: {m.awarded_on}</span>
                    <span>Expires: {m.expires_on}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between pt-2">
            {locked ? (
              <Button
                type="button"
                variant="outline"
                onClick={startOver}
                disabled={isPending}
                className="gap-1.5 text-xs max-sm:w-full"
              >
                <RotateCcw className="size-3.5" />
                Start over
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => go("configure")}
                disabled={isPending}
                className="text-xs max-sm:w-full"
              >
                Back
              </Button>
            )}

            <Button
              type="button"
              onClick={confirm}
              disabled={isPending || !bucket || parsedDays < 1}
              className="gap-2 text-xs max-sm:w-full"
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Award className="size-4" />
              )}
              {isPending
                ? "Applying merits…"
                : error && locked
                ? "Retry application"
                : `Confirm & apply ${formatDays(parsedDays)}`}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

export function MeritApplicationResultCard({
  application,
  summary,
  remainingAvailableMerits,
  listHref,
}: {
  application: StudentMeritApplicationGroup;
  summary: StudentDisciplinarySummary;
  remainingAvailableMerits: number;
  listHref: string;
}) {
  const bucketLabel = application.bucket === "office" ? "Office Duty" : "Clinical (RLE) Duty";
  const targetBalance =
    application.bucket === "office" ? summary.office.balance : summary.rle.balance;

  return (
    <Card className="flex flex-col gap-6 p-4 sm:p-6">
      {/* Success Banner */}
      <div className="flex items-start gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-800 dark:text-emerald-200">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="flex flex-col gap-0.5">
          <p className="font-semibold text-base">Merits applied successfully</p>
          <p className="text-xs text-muted-foreground">
            Applied {formatDays(application.applied_days)} of merits toward {bucketLabel}.
          </p>
        </div>
      </div>

      {/* Application Details Summary */}
      <div className="grid gap-4 rounded-lg border border-border/60 bg-muted/20 p-4 text-xs sm:grid-cols-2">
        <div>
          <span className="text-muted-foreground">Target Bucket:</span>{" "}
          <div className="mt-1">
            <BucketBadge bucket={application.bucket} />
          </div>
        </div>
        <div>
          <span className="text-muted-foreground">Applied Units:</span>{" "}
          <p className="mt-1 font-semibold text-foreground">
            {formatDays(application.applied_days)}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Reference Group ID:</span>{" "}
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            {application.application_group_id}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Applied At:</span>{" "}
          <p className="mt-1 font-medium text-foreground">
            {formatManilaDateTime(application.applied_at)}
          </p>
        </div>
      </div>

      {/* Updated Balance Overview */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border/70 p-3 bg-card">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {bucketLabel} Balance
          </span>
          <div className="mt-2 font-heading text-xl font-semibold tracking-tight tabular-nums">
            {targetBalance > 0 ? formatDays(targetBalance) : "0 days (Clear)"}
          </div>
        </div>

        <div className="rounded-lg border border-border/70 p-3 bg-card">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Remaining Merits
          </span>
          <div className="mt-2 font-heading text-xl font-semibold tracking-tight tabular-nums">
            {formatDays(remainingAvailableMerits)}
          </div>
        </div>

        <div className="rounded-lg border border-border/70 p-3 bg-card">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Overall Standing
          </span>
          <div className="mt-2 font-heading text-xl font-semibold tracking-tight tabular-nums">
            {summary.totalActiveBalance > 0
              ? `${formatDays(summary.totalActiveBalance)} pending`
              : "In Good Standing"}
          </div>
        </div>
      </div>

      {/* Return Button */}
      <div className="flex justify-end pt-2">
        <Link
          href={listHref}
          className={cn(buttonVariants({ variant: "outline" }), "text-sm max-sm:w-full")}
        >
          Return to conduct ledger
        </Link>
      </div>
    </Card>
  );
}
