"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { ArrowLeft, CircleAlert, Loader2, RotateCcw } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BucketBadge } from "@/features/discipline/components/disciplinary-badges";
import { cn } from "@/lib/utils";

import { createServiceSessionAction } from "../actions";
import { combineDateAndTimeManila } from "../calculations";
import type { ServiceBucket } from "../contracts";
import { createServiceSessionSchema } from "../schemas";

export function CreateSessionFlow({
  allowedBuckets,
  initialDutyOn,
  listHref,
  semesterStartsOn,
  semesterEndsOn,
}: {
  allowedBuckets: ServiceBucket[];
  initialDutyOn: string;
  listHref: string;
  semesterStartsOn?: string | null;
  semesterEndsOn?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Form state
  const [bucket, setBucket] = useState<ServiceBucket | "">(() =>
    allowedBuckets.length === 1 ? allowedBuckets[0] : ""
  );
  const [dutyOn, setDutyOn] = useState(initialDutyOn);
  const [scheduledStartTime, setScheduledStartTime] = useState("08:00");
  const [scheduledEndTime, setScheduledEndTime] = useState("17:00");
  const [location, setLocation] = useState("");
  const [lateAfterMinutes, setLateAfterMinutes] = useState("15");
  const [timeInFromTime, setTimeInFromTime] = useState("07:30");
  const [timeInUntilTime, setTimeInUntilTime] = useState("09:00");
  const [timeOutFromTime, setTimeOutFromTime] = useState("16:30");
  const [timeOutUntilTime, setTimeOutUntilTime] = useState("17:30");

  // Idempotency and error state
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [retryableError, setRetryableError] = useState(false);

  // Field accessible IDs
  const dutyOnId = useId();
  const scheduledStartId = useId();
  const scheduledEndId = useId();
  const locationId = useId();
  const lateAfterMinutesId = useId();
  const timeInFromId = useId();
  const timeInUntilId = useId();
  const timeOutFromId = useId();
  const timeOutUntilId = useId();
  const bucketHelpId = useId();
  const lateHelpId = useId();
  const timeInHelpId = useId();
  const timeOutHelpId = useId();

  function startOver() {
    setLocked(false);
    setError(null);
    setRetryableError(false);
    setRequestKey(crypto.randomUUID());
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (locked && !retryableError) return;

    if (!bucket) {
      setError("Please select a duty track (Office or Clinical/RLE).");
      return;
    }

    if (!dutyOn) {
      setError("Please select a duty date.");
      return;
    }

    // Build ISO timestamps anchored strictly to Asia/Manila (+08:00)
    const payload = {
      requestKey,
      bucket,
      dutyOn,
      scheduledStart: combineDateAndTimeManila(dutyOn, scheduledStartTime),
      scheduledEnd: combineDateAndTimeManila(dutyOn, scheduledEndTime),
      location: location.trim() || null,
      lateAfterMinutes: parseInt(lateAfterMinutes, 10),
      timeInFrom: combineDateAndTimeManila(dutyOn, timeInFromTime),
      timeInUntil: combineDateAndTimeManila(dutyOn, timeInUntilTime),
      timeOutFrom: combineDateAndTimeManila(dutyOn, timeOutFromTime),
      timeOutUntil: combineDateAndTimeManila(dutyOn, timeOutUntilTime),
    };

    // Client-side schema validation before dispatching to server action
    const parsed = createServiceSessionSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please verify the session details.");
      return;
    }

    setError(null);
    setLocked(true);

    startTransition(async () => {
      try {
        const res = await createServiceSessionAction(parsed.data);
        if (res && !res.success) {
          if (res.retryable) {
            setRetryableError(true);
            setError(res.error);
          } else {
            setLocked(false);
            setRetryableError(false);
            setRequestKey(crypto.randomUUID());
            setError(res.error);
            router.refresh();
          }
        }
      } catch (err) {
        if (
          err instanceof Error &&
          "digest" in err &&
          typeof (err as { digest?: unknown }).digest === "string" &&
          (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
        ) {
          throw err;
        }
        setRetryableError(true);
        setError(
          "Unable to reach the server. If your session was created, confirming again will not duplicate it."
        );
      }
    });
  }

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Header and Back Link */}
      <div className="flex flex-col gap-2">
        <Link
          href={listHref}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "max-sm:min-h-11 w-fit gap-1")}
        >
          <ArrowLeft className="size-4" /> Back to service sessions
        </Link>
        <div>
          <h2 className="section-title">Create service session</h2>
          <p className="text-sm text-muted-foreground">
            Schedule a single-day duty session and define participant attendance windows.
          </p>
        </div>
      </div>

      {/* Inline Error Alert */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Form Card */}
      <Card className="flex flex-col gap-6 p-4 sm:p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
          {/* Section 1: Duty Track & Date */}
          <div className="flex flex-col gap-4">
            <h3 className="text-base font-semibold text-foreground">Duty Track & Schedule</h3>

            {/* Bucket Selection */}
            {allowedBuckets.length === 1 ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Duty Track</span>
                <div className="flex items-center gap-2">
                  <BucketBadge bucket={allowedBuckets[0]} />
                  <span className="text-xs text-muted-foreground">
                    {allowedBuckets[0] === "office" ? "Office Duty Track" : "Clinical (RLE) Duty Track"}
                  </span>
                </div>
              </div>
            ) : (
              <fieldset className="flex flex-col gap-2" aria-describedby={bucketHelpId}>
                <legend className="text-sm font-medium">
                  Duty Track <span className="text-destructive">*</span>
                </legend>
                <p id={bucketHelpId} className="text-xs text-muted-foreground">
                  Select whether this service duty session is for Office Duty or Clinical (RLE) Duty.
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {allowedBuckets.map((b) => (
                    <label
                      key={b}
                      className={cn(
                        "flex cursor-pointer items-center justify-between rounded-lg border p-3 text-sm font-medium max-sm:min-h-11",
                        bucket === b
                          ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary"
                          : "border-border hover:bg-muted/50 text-muted-foreground"
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name="dutyBucket"
                          value={b}
                          checked={bucket === b}
                          disabled={locked}
                          onChange={() => setBucket(b)}
                          className="size-4 text-primary focus:ring-primary"
                        />
                        <span>{b === "office" ? "Office Duty" : "Clinical (RLE) Duty"}</span>
                      </div>
                      <BucketBadge bucket={b} />
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {/* Duty Date */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor={dutyOnId} className="text-sm font-medium">
                Duty Date <span className="text-destructive">*</span>
              </label>
              <Input
                id={dutyOnId}
                type="date"
                value={dutyOn}
                min={semesterStartsOn ?? undefined}
                max={semesterEndsOn ?? undefined}
                disabled={locked}
                onChange={(e) => setDutyOn(e.target.value)}
                className="max-sm:min-h-11"
                required
              />
              {semesterStartsOn && semesterEndsOn && (
                <p className="text-xs text-muted-foreground">
                  Active semester context: {semesterStartsOn} to {semesterEndsOn}
                </p>
              )}
            </div>

            {/* Scheduled Start & End Times */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor={scheduledStartId} className="text-sm font-medium">
                  Scheduled Start Time <span className="text-destructive">*</span>
                </label>
                <Input
                  id={scheduledStartId}
                  type="time"
                  value={scheduledStartTime}
                  disabled={locked}
                  onChange={(e) => setScheduledStartTime(e.target.value)}
                  className="max-sm:min-h-11"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor={scheduledEndId} className="text-sm font-medium">
                  Scheduled End Time <span className="text-destructive">*</span>
                </label>
                <Input
                  id={scheduledEndId}
                  type="time"
                  value={scheduledEndTime}
                  disabled={locked}
                  onChange={(e) => setScheduledEndTime(e.target.value)}
                  className="max-sm:min-h-11"
                  required
                />
              </div>
            </div>

            {/* Location (Optional) */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor={locationId} className="text-sm font-medium">
                Location <span className="text-xs font-normal text-muted-foreground">(Optional)</span>
              </label>
              <Input
                id={locationId}
                type="text"
                maxLength={255}
                value={location}
                disabled={locked}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Dean's Office, Ward 3B, Clinical Lab"
                className="max-sm:min-h-11"
              />
            </div>
          </div>

          <div className="h-px w-full bg-border" aria-hidden="true" />

          {/* Section 2: Attendance Windows & Lateness Threshold */}
          <div className="flex flex-col gap-4">
            <h3 className="text-base font-semibold text-foreground">Attendance Windows & Lateness</h3>

            {/* Lateness Threshold */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor={lateAfterMinutesId} className="text-sm font-medium">
                Lateness Grace Period (minutes) <span className="text-destructive">*</span>
              </label>
              <Input
                id={lateAfterMinutesId}
                type="number"
                min="0"
                max="2147483647"
                step="1"
                value={lateAfterMinutes}
                disabled={locked}
                onChange={(e) => setLateAfterMinutes(e.target.value)}
                aria-describedby={lateHelpId}
                className="max-sm:min-h-11 max-w-xs"
                required
              />
              <p id={lateHelpId} className="text-xs text-muted-foreground">
                Minutes past scheduled start after which participant check-in is evaluated as Late.
              </p>
            </div>

            {/* Time-In Window */}
            <fieldset className="flex flex-col gap-2" aria-describedby={timeInHelpId}>
              <legend className="text-sm font-medium">
                Time-In Check-In Window <span className="text-destructive">*</span>
              </legend>
              <p id={timeInHelpId} className="text-xs text-muted-foreground">
                Earliest and latest allowed check-in times for participants.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={timeInFromId} className="text-xs text-muted-foreground">
                    From (Window Opens)
                  </label>
                  <Input
                    id={timeInFromId}
                    type="time"
                    value={timeInFromTime}
                    disabled={locked}
                    onChange={(e) => setTimeInFromTime(e.target.value)}
                    className="max-sm:min-h-11"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={timeInUntilId} className="text-xs text-muted-foreground">
                    Until (Window Closes)
                  </label>
                  <Input
                    id={timeInUntilId}
                    type="time"
                    value={timeInUntilTime}
                    disabled={locked}
                    onChange={(e) => setTimeInUntilTime(e.target.value)}
                    className="max-sm:min-h-11"
                    required
                  />
                </div>
              </div>
            </fieldset>

            {/* Time-Out Window */}
            <fieldset className="flex flex-col gap-2" aria-describedby={timeOutHelpId}>
              <legend className="text-sm font-medium">
                Time-Out Check-Out Window <span className="text-destructive">*</span>
              </legend>
              <p id={timeOutHelpId} className="text-xs text-muted-foreground">
                Earliest and latest allowed check-out times for participants.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={timeOutFromId} className="text-xs text-muted-foreground">
                    From (Window Opens)
                  </label>
                  <Input
                    id={timeOutFromId}
                    type="time"
                    value={timeOutFromTime}
                    disabled={locked}
                    onChange={(e) => setTimeOutFromTime(e.target.value)}
                    className="max-sm:min-h-11"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={timeOutUntilId} className="text-xs text-muted-foreground">
                    Until (Window Closes)
                  </label>
                  <Input
                    id={timeOutUntilId}
                    type="time"
                    value={timeOutUntilTime}
                    disabled={locked}
                    onChange={(e) => setTimeOutUntilTime(e.target.value)}
                    className="max-sm:min-h-11"
                    required
                  />
                </div>
              </div>
            </fieldset>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end pt-2">
            {retryableError ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={startOver}
                  className="max-sm:min-h-11"
                >
                  Start over
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  className="max-sm:min-h-11 gap-1.5"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Retrying...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="size-4" /> Retry creation
                    </>
                  )}
                </Button>
              </>
            ) : (
              <>
                <Link
                  href={listHref}
                  className={cn(buttonVariants({ variant: "outline" }), "max-sm:min-h-11 text-center")}
                >
                  Cancel
                </Link>
                <Button
                  type="submit"
                  disabled={isPending || locked}
                  className="max-sm:min-h-11 gap-1.5"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Creating session...
                    </>
                  ) : (
                    "Create session"
                  )}
                </Button>
              </>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
