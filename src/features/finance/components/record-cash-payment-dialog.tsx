"use client";

import { useId, useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  History,
  Loader2,
  RotateCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { isoToManilaInput, manilaInputToIso } from "@/features/events/schemas";
import { cn } from "@/lib/utils";
import { recordCashPayment } from "../actions";
import { formatPhDate, formatPhp, fromCents, toCents } from "../calculations";
import {
  hasSameSemesterObligations,
  type ObligationWithStandingDTO,
} from "../contracts";

type CashDialogStage = "obligations" | "review" | "done";

const STEPS = ["Obligations", "Confirm"] as const;
const stageIndex: Record<CashDialogStage, number> = {
  obligations: 0,
  review: 1,
  done: 2,
};

type SemesterGroup = {
  semesterId: string;
  label: string;
  isPastSemester: boolean;
  obligations: ObligationWithStandingDTO[];
  payableIds: string[];
  payableTotal: number;
};

type CashPaymentResultSummary = {
  paymentId: string;
  receiptId: string;
  semesterLabel: string;
  receivedAt: string;
  amount: number;
  items: Array<{ id: string; description: string; amount: number }>;
};

function StepTracker({ current }: { current: number }) {
  const clamped = Math.min(current, STEPS.length - 1);
  return (
    <>
      <p className="text-xs font-medium text-muted-foreground sm:hidden">
        Step {clamped + 1} of {STEPS.length} ·{" "}
        <span className="text-foreground">{STEPS[clamped]}</span>
      </p>
      <ol
        aria-label="Cash payment recording steps"
        className="hidden items-center gap-2 text-xs sm:flex"
      >
        {STEPS.map((step, i) => (
          <li
            key={step}
            aria-current={i === current ? "step" : undefined}
            className="flex flex-1 items-center gap-2 last:flex-none"
          >
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                i < current && "border-primary bg-primary text-primary-foreground",
                i === current && "border-primary text-primary",
                i > current && "border-border text-muted-foreground"
              )}
            >
              {i < current ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span
              className={cn(
                "font-medium",
                i <= current ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {step}
            </span>
            {i < STEPS.length - 1 && (
              <span
                className={cn(
                  "h-px flex-1",
                  i < current ? "bg-primary" : "bg-border"
                )}
              />
            )}
          </li>
        ))}
      </ol>
    </>
  );
}

export function RecordCashPaymentDialog({
  isOpen,
  onClose,
  student,
  obligations,
  initialSemesterId,
  onViewPaymentHistory,
}: {
  isOpen: boolean;
  onClose: () => void;
  student: {
    id: string;
    universityId: string | null;
    fullName: string;
  };
  obligations: ObligationWithStandingDTO[];
  initialSemesterId?: string | null;
  onViewPaymentHistory?: () => void;
}) {
  const receivedAtInputId = useId();
  const confirmCheckboxId = useId();

  const semesterGroups = useMemo<SemesterGroup[]>(() => {
    const payable = obligations.filter(
      (item) =>
        item.status === "unpaid" || item.status === "pending_verification"
    );
    const grouped = new Map<string, SemesterGroup & { payableCents: number }>();

    for (const item of payable) {
      let group = grouped.get(item.semester_id);
      if (!group) {
        group = {
          semesterId: item.semester_id,
          label: item.semester_code ?? "Academic Term",
          isPastSemester: Boolean(item.is_past_semester),
          obligations: [],
          payableIds: [],
          payableTotal: 0,
          payableCents: 0,
        };
        grouped.set(item.semester_id, group);
      }
      group.obligations.push(item);
      group.payableIds.push(item.id);
      group.payableCents += toCents(Number(item.amount));
    }

    return Array.from(grouped.values())
      .map(({ payableCents, ...group }) => ({
        ...group,
        payableTotal: fromCents(payableCents),
      }))
      .sort((a, b) => {
        if (a.isPastSemester !== b.isPastSemester) {
          return a.isPastSemester ? -1 : 1;
        }
        return a.label.localeCompare(b.label);
      });
  }, [obligations]);

  const defaultSemesterId = useMemo(() => {
    if (
      initialSemesterId &&
      semesterGroups.some((g) => g.semesterId === initialSemesterId)
    ) {
      return initialSemesterId;
    }
    return semesterGroups[0]?.semesterId ?? "";
  }, [initialSemesterId, semesterGroups]);

  const [stage, setStage] = useState<CashDialogStage>("obligations");
  const [selectedSemesterId, setSelectedSemesterId] =
    useState<string>(defaultSemesterId);
  const [selectedObligationIds, setSelectedObligationIds] = useState<string[]>(
    []
  );
  const [receivedAtInput, setReceivedAtInput] = useState<string>("");
  const [confirmedCollected, setConfirmedCollected] = useState(false);
  const [submissionRequestKey, setSubmissionRequestKey] = useState<
    string | null
  >(null);
  const [lockedReceivedAtIso, setLockedReceivedAtIso] = useState<string | null>(
    null
  );
  const [resultSummary, setResultSummary] =
    useState<CashPaymentResultSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setStage("obligations");
      setSelectedSemesterId(defaultSemesterId);
      setSelectedObligationIds([]);
      setReceivedAtInput("");
      setConfirmedCollected(false);
      setSubmissionRequestKey(null);
      setLockedReceivedAtIso(null);
      setResultSummary(null);
      setError(null);
    }
  }

  const activeGroup = useMemo(
    () =>
      semesterGroups.find((g) => g.semesterId === selectedSemesterId) ??
      semesterGroups[0] ??
      null,
    [semesterGroups, selectedSemesterId]
  );

  const selectedObligations = useMemo(() => {
    if (!activeGroup) return [];
    const selectedSet = new Set(selectedObligationIds);
    return activeGroup.obligations.filter((item) => selectedSet.has(item.id));
  }, [activeGroup, selectedObligationIds]);

  const selectedTotal = useMemo(() => {
    const totalCents = selectedObligations.reduce(
      (sum, item) => sum + toCents(Number(item.amount)),
      0
    );
    return fromCents(totalCents);
  }, [selectedObligations]);

  const hasAttemptedSubmission = submissionRequestKey !== null;

  function handleClose() {
    if (isPending) return;
    setError(null);
    onClose();
  }

  function handleSelectSemester(semesterId: string) {
    if (semesterId === selectedSemesterId || hasAttemptedSubmission) return;
    setError(null);
    setSelectedSemesterId(semesterId);
    // Strict FL-024 rule: one cash payment covers obligations from one semester only.
    setSelectedObligationIds([]);
    setSubmissionRequestKey(null);
    setLockedReceivedAtIso(null);
  }

  function toggleObligation(obligationId: string) {
    if (hasAttemptedSubmission) return;
    setError(null);
    setSubmissionRequestKey(null);
    setLockedReceivedAtIso(null);
    setSelectedObligationIds((prev) =>
      prev.includes(obligationId)
        ? prev.filter((id) => id !== obligationId)
        : [...prev, obligationId]
    );
  }

  function handleToggleAllInSemester() {
    if (!activeGroup || hasAttemptedSubmission) return;
    setError(null);
    setSubmissionRequestKey(null);
    setLockedReceivedAtIso(null);
    const allIds = activeGroup.payableIds;
    const allSelected =
      allIds.length > 0 &&
      allIds.every((id) => selectedObligationIds.includes(id));
    setSelectedObligationIds(allSelected ? [] : allIds);
  }

  function handleNextFromObligations() {
    setError(null);
    if (!activeGroup) {
      setError("No unpaid obligations are available.");
      return;
    }
    if (selectedObligations.length === 0) {
      setError("Select at least one obligation to pay.");
      return;
    }
    if (
      !hasSameSemesterObligations(selectedObligations, activeGroup.semesterId)
    ) {
      setError("All selected obligations must belong to the same semester.");
      return;
    }
    setSelectedSemesterId(activeGroup.semesterId);
    if (!receivedAtInput) {
      setReceivedAtInput(isoToManilaInput(new Date().toISOString()));
    }
    setConfirmedCollected(false);
    setStage("review");
  }

  function handleStartOver() {
    if (isPending) return;
    setError(null);
    setSubmissionRequestKey(null);
    setLockedReceivedAtIso(null);
    setConfirmedCollected(false);
    setReceivedAtInput("");
    setStage("obligations");
  }

  function resolveReceivedAtIso(): string | null {
    if (lockedReceivedAtIso) return lockedReceivedAtIso;
    if (!receivedAtInput) return null;

    let candidateIso: string | null = null;
    try {
      candidateIso = manilaInputToIso(receivedAtInput);
    } catch {
      return null;
    }
    if (!candidateIso) return null;

    const candidateMs = Date.parse(candidateIso);
    if (!Number.isFinite(candidateMs)) return null;

    const nowMs = Date.now();
    const currentManilaMinute = isoToManilaInput(new Date(nowMs).toISOString());
    if (candidateMs > nowMs) {
      if (receivedAtInput === currentManilaMinute) {
        return new Date(nowMs).toISOString();
      }
      return "FUTURE";
    }
    return candidateIso;
  }

  function handleSubmit() {
    setError(null);
    if (!activeGroup || selectedObligations.length === 0) {
      setError("Select at least one obligation to pay.");
      return;
    }
    if (
      !hasSameSemesterObligations(selectedObligations, activeGroup.semesterId)
    ) {
      setError("All selected obligations must belong to the same semester.");
      return;
    }
    if (!confirmedCollected) {
      setError(
        "Confirm that the full cash amount was collected before submitting."
      );
      return;
    }

    const resolvedIso = resolveReceivedAtIso();
    if (!resolvedIso) {
      setError("Enter a valid receipt date and time.");
      return;
    }
    if (resolvedIso === "FUTURE") {
      setError("Receipt time cannot be in the future.");
      return;
    }

    // Lock the request key and timestamp on the first confirm attempt so retries replay safely.
    const activeKey = submissionRequestKey ?? crypto.randomUUID();
    const activeReceivedAt = lockedReceivedAtIso ?? resolvedIso;
    if (!submissionRequestKey) setSubmissionRequestKey(activeKey);
    if (!lockedReceivedAtIso) setLockedReceivedAtIso(activeReceivedAt);

    const itemsSnapshot = selectedObligations.map((item) => ({
      id: item.id,
      description: item.description,
      amount: Number(item.amount),
    }));
    const semesterLabel = activeGroup.label;
    const semesterId = activeGroup.semesterId;

    startTransition(async () => {
      const res = await recordCashPayment({
        studentId: student.id,
        semesterId,
        obligationIds: itemsSnapshot.map((item) => item.id),
        receivedAt: activeReceivedAt,
        requestKey: activeKey,
      });

      if (!res.success) {
        setError(res.error);
        return;
      }

      setResultSummary({
        paymentId: res.paymentId,
        receiptId: res.receiptId,
        semesterLabel,
        receivedAt: activeReceivedAt,
        amount: res.amount,
        items: itemsSnapshot,
      });
      setStage("done");
    });
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isPending) handleClose();
      }}
    >
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] grid-cols-1 overflow-x-hidden overflow-y-auto p-5 sm:max-w-xl sm:p-6">
        <DialogHeader>
          <DialogTitle>
            {stage === "done"
              ? "Cash Payment Recorded"
              : "Record Cash Payment"}
          </DialogTitle>
          <DialogDescription>
            {stage === "done"
              ? "The selected obligations are now marked paid and verified."
              : "Select complete unpaid obligations from a single semester and confirm the cash collected."}
          </DialogDescription>
        </DialogHeader>

        {stage !== "done" && <StepTracker current={stageIndex[stage]} />}

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Step 1: Term & Complete Obligation Selection */}
        {stage === "obligations" && (
          <div className="min-w-0 space-y-4">
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
              <div className="text-sm font-semibold text-foreground">
                {student.fullName}
              </div>
              {student.universityId && (
                <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {student.universityId}
                </div>
              )}
            </div>

            {semesterGroups.length === 0 ? (
              <div className="rounded-xl border border-border bg-muted/30 p-5 text-center text-sm text-muted-foreground">
                This student has no unpaid obligations available for cash
                collection.
              </div>
            ) : (
              <>
                <fieldset className="min-w-0 space-y-2">
                  <legend className="mb-2 text-xs font-medium text-muted-foreground">
                    {semesterGroups.length > 1
                      ? "Choose a term · one term per cash payment"
                      : "Term"}
                  </legend>
                  <div className="overflow-hidden rounded-xl border border-border bg-card">
                    {semesterGroups.map((group) => {
                      const isSelected =
                        group.semesterId === activeGroup?.semesterId;
                      const single = semesterGroups.length === 1;
                      return (
                        <label
                          key={group.semesterId}
                          className={cn(
                            "flex min-h-14 items-center gap-3 border-b border-border px-4 py-3 transition-colors last:border-b-0",
                            single ? "cursor-default" : "cursor-pointer",
                            isSelected && !single
                              ? "bg-primary/5"
                              : !single && "hover:bg-muted/40"
                          )}
                        >
                          {!single && (
                            <input
                              type="radio"
                              name="cash-term"
                              checked={isSelected}
                              disabled={hasAttemptedSubmission}
                              onChange={() =>
                                handleSelectSemester(group.semesterId)
                              }
                              className="size-4 shrink-0 accent-primary"
                            />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-foreground">
                                {group.label}
                              </span>
                              {group.isPastSemester && (
                                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                                  Prior term · overdue
                                </span>
                              )}
                            </span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {group.payableIds.length}{" "}
                              {group.payableIds.length === 1 ? "item" : "items"}{" "}
                              unpaid
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block text-sm font-semibold tabular-nums text-foreground">
                              {formatPhp(group.payableTotal)}
                            </span>
                            <span className="block text-[11px] text-muted-foreground">
                              outstanding
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                {activeGroup && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        Select complete obligations
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={hasAttemptedSubmission}
                        onClick={handleToggleAllInSemester}
                        className="min-h-11 px-3 text-xs"
                      >
                        {activeGroup.payableIds.every((id) =>
                          selectedObligationIds.includes(id)
                        )
                          ? "Clear all"
                          : "Select all"}
                      </Button>
                    </div>

                    <div className="divide-y divide-border rounded-xl border border-border bg-card">
                      {activeGroup.obligations.map((item) => {
                        const checked = selectedObligationIds.includes(item.id);
                        return (
                          <label
                            key={item.id}
                            className={cn(
                              "flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3.5 py-3 transition-colors first:rounded-t-xl last:rounded-b-xl",
                              checked ? "bg-primary/5" : "hover:bg-muted/40"
                            )}
                          >
                            <div className="flex min-w-0 items-start gap-3">
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={hasAttemptedSubmission}
                                onChange={() => toggleObligation(item.id)}
                                className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
                              />
                              <div className="min-w-0 space-y-1">
                                <div className="text-sm font-medium text-foreground">
                                  {item.description}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                  <span className="capitalize">{item.kind}</span>
                                  {item.status === "pending_verification" && (
                                    <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                                      Transfer pending review
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                              {formatPhp(Number(item.amount))}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-3">
                  <div className="space-y-0.5">
                    <div className="text-xs text-muted-foreground">
                      Selected ({selectedObligations.length}{" "}
                      {selectedObligations.length === 1 ? "item" : "items"})
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Full obligation amounts only · no partial payments
                    </div>
                  </div>
                  <div className="font-heading text-lg font-semibold tabular-nums text-foreground">
                    {formatPhp(selectedTotal)}
                  </div>
                </div>
              </>
            )}

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                className="min-h-11"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleNextFromObligations}
                disabled={selectedObligations.length === 0}
                className="min-h-11"
              >
                Continue to Confirm
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 2: Confirm Cash Collection Details */}
        {stage === "review" && activeGroup && (
          <div className="min-w-0 space-y-4">
            <div className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
              <div className="flex items-start justify-between gap-3 border-b border-border pb-2.5">
                <span className="text-xs text-muted-foreground">Student</span>
                <div className="text-right">
                  <div className="font-medium text-foreground">
                    {student.fullName}
                  </div>
                  {student.universityId && (
                    <div className="font-mono text-xs text-muted-foreground">
                      {student.universityId}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-b border-border pb-2.5">
                <span className="text-xs text-muted-foreground">
                  Academic Term
                </span>
                <span className="font-medium text-foreground">
                  {activeGroup.label}
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="text-xs text-muted-foreground">
                  Covered Obligations ({selectedObligations.length})
                </div>
                <ul className="space-y-1">
                  {selectedObligations.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="truncate text-foreground">
                        {item.description}
                      </span>
                      <span className="shrink-0 font-medium tabular-nums text-foreground">
                        {formatPhp(Number(item.amount))}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between border-t border-border pt-2.5 font-semibold">
                  <span className="text-xs text-muted-foreground">
                    Total Cash Collected
                  </span>
                  <span className="font-heading text-base tabular-nums text-foreground">
                    {formatPhp(selectedTotal)}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor={receivedAtInputId}
                className="block text-sm font-medium text-foreground"
              >
                Actual Receipt Date &amp; Time (Asia/Manila)
              </label>
              <Input
                id={receivedAtInputId}
                type="datetime-local"
                value={receivedAtInput}
                disabled={isPending || hasAttemptedSubmission}
                onChange={(e) => {
                  setError(null);
                  setReceivedAtInput(e.target.value);
                }}
                className="min-h-11 text-base md:text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Record when the cash was physically collected. Future times are
                not allowed.
              </p>
            </div>

            <label
              htmlFor={confirmCheckboxId}
              className={cn(
                "flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/30 p-3.5 text-sm",
                (isPending || hasAttemptedSubmission) && "cursor-not-allowed opacity-75"
              )}
            >
              <input
                id={confirmCheckboxId}
                type="checkbox"
                checked={confirmedCollected}
                disabled={isPending || hasAttemptedSubmission}
                onChange={(e) => {
                  setError(null);
                  setConfirmedCollected(e.target.checked);
                }}
                className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
              />
              <span className="text-xs leading-relaxed text-foreground">
                I confirm that the full cash amount of{" "}
                <span className="font-semibold tabular-nums">
                  {formatPhp(selectedTotal)}
                </span>{" "}
                was collected from this student.
              </span>
            </label>

            {selectedObligations.some(
              (item) => item.status === "pending_verification"
            ) && (
              <p className="text-xs leading-relaxed text-amber-800">
                One or more selected obligations currently have a transfer
                pending review. Recording cash settles them immediately; reject
                any duplicate transfer separately in Payment History.
              </p>
            )}

            <DialogFooter className="gap-2 pt-2">
              {hasAttemptedSubmission ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleStartOver}
                  disabled={isPending}
                  className="min-h-11 gap-1.5"
                >
                  <RotateCcw className="size-3.5" />
                  Start over
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setError(null);
                    setStage("obligations");
                  }}
                  disabled={isPending}
                  className="min-h-11"
                >
                  Back
                </Button>
              )}
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={isPending || !confirmedCollected}
                className="min-h-11"
              >
                {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                {isPending
                  ? "Recording..."
                  : hasAttemptedSubmission
                    ? "Retry Recording Cash"
                    : "Record Cash Payment"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 3: Verified Cash Payment Result */}
        {stage === "done" && resultSummary && (
          <div className="min-w-0 space-y-4">
            <div className="flex flex-col items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 text-center">
              <CheckCircle2 className="size-8 text-emerald-600" />
              <div className="font-heading text-xl font-semibold tabular-nums text-foreground">
                {formatPhp(resultSummary.amount)}
              </div>
              <span className="inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                Verified · Cash Collected
              </span>
            </div>

            <div className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
              <dl className="space-y-2 text-xs">
                <div className="grid grid-cols-[7.5rem_1fr] gap-2">
                  <dt className="text-muted-foreground">Student</dt>
                  <dd className="min-w-0 break-words font-medium text-foreground">
                    {student.fullName}
                    {student.universityId ? ` (${student.universityId})` : ""}
                  </dd>
                </div>
                <div className="grid grid-cols-[7.5rem_1fr] gap-2">
                  <dt className="text-muted-foreground">Term</dt>
                  <dd className="min-w-0 text-foreground">
                    {resultSummary.semesterLabel}
                  </dd>
                </div>
                <div className="grid grid-cols-[7.5rem_1fr] gap-2">
                  <dt className="text-muted-foreground">Method</dt>
                  <dd className="text-foreground">Cash</dd>
                </div>
                <div className="grid grid-cols-[7.5rem_1fr] gap-2">
                  <dt className="text-muted-foreground">Received</dt>
                  <dd className="text-foreground">
                    {formatPhDate(resultSummary.receivedAt)}
                  </dd>
                </div>
                <div className="grid grid-cols-[7.5rem_1fr] gap-2">
                  <dt className="text-muted-foreground">Payment ID</dt>
                  <dd className="min-w-0 break-all font-mono text-foreground">
                    {resultSummary.paymentId}
                  </dd>
                </div>
                <div className="grid grid-cols-[7.5rem_1fr] gap-2">
                  <dt className="text-muted-foreground">Receipt ID</dt>
                  <dd className="min-w-0 break-all font-mono text-foreground">
                    {resultSummary.receiptId}
                  </dd>
                </div>
              </dl>

              <div className="space-y-1.5 border-t border-border pt-3">
                <div className="text-xs text-muted-foreground">
                  Covered Obligations ({resultSummary.items.length})
                </div>
                <ul className="space-y-1">
                  {resultSummary.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-start justify-between gap-3 text-xs"
                    >
                      <span className="min-w-0 break-words text-foreground">
                        {item.description}
                      </span>
                      <span className="shrink-0 font-mono tabular-nums text-foreground">
                        {formatPhp(item.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2">
              {onViewPaymentHistory ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                    className="min-h-11"
                  >
                    Close
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      handleClose();
                      onViewPaymentHistory();
                    }}
                    className="min-h-11 gap-2"
                  >
                    <History className="size-4" />
                    View Payment History
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  onClick={handleClose}
                  className="min-h-11"
                >
                  Close
                </Button>
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
