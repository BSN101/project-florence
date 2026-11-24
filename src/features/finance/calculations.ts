import type {
  ObligationDTO,
  ObligationStandingStatus,
  ObligationWithStandingDTO,
  PaymentHistoryDTO,
  StudentFinancialSummaryDTO,
} from "./contracts";

/**
 * Standard Philippine Peso currency formatter.
 */
export const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPhp(amount: number): string {
  return currencyFormatter.format(amount);
}

export const phDateFormatter = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeZone: "Asia/Manila",
});

export function formatPhDate(isoString: string): string {
  try {
    return phDateFormatter.format(new Date(isoString));
  } catch {
    return isoString;
  }
}

/** Convert float amount to integer cents to prevent binary floating-point drift. */
export function toCents(amount: number): number {
  return Math.round((Number.isFinite(amount) ? amount : 0) * 100);
}

/** Convert integer cents back to two-decimal float. */
export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export type PaymentAllocationRecord = {
  payment_id: string;
  obligation_id: string;
};

export type PaymentStandingRecord = {
  id: string;
  status: string;
  record_status: string;
  is_receipt_record: boolean;
  receipt_id: string | null;
};

export type RefundStandingRecord = {
  receipt_id: string;
  refunded_at?: string | null;
  reason?: string | null;
};

export type PaymentMoneyTotalRecord = {
  record_status: string;
  is_receipt_record: boolean;
  receipt_id: string | null;
  amount: number | string;
  is_refunded?: boolean;
  semester_id?: string;
};

/**
 * Calculates retained money totals (gross received, refunds, net received) from
 * payment records without double-counting superseded corrections or duplicate links (FL-027 / T-038).
 *
 * Rules:
 * - Only current authoritative receipt records (`record_status === "current" && is_receipt_record && receipt_id`)
 *   count toward Gross Received, deduplicated by `receipt_id`.
 * - Each refunded authoritative receipt counts its full amount toward Refunds
 *   (via `is_refunded`).
 * - Net Received = Gross Received - Refunds, using integer cents arithmetic.
 */
export function calculatePaymentMoneyTotals(
  payments: ReadonlyArray<PaymentMoneyTotalRecord>
): {
  totalGrossReceivedAmount: number;
  totalRefundedAmount: number;
  totalNetReceivedAmount: number;
} {
  let grossReceivedCents = 0;
  let refundedCents = 0;
  const seenReceiptIds = new Set<string>();

  for (const p of payments) {
    if (p.record_status !== "current" || !p.is_receipt_record || !p.receipt_id) {
      continue;
    }
    if (seenReceiptIds.has(p.receipt_id)) {
      continue;
    }
    seenReceiptIds.add(p.receipt_id);

    const cents = toCents(Number(p.amount));
    grossReceivedCents += cents;

    if (p.is_refunded) {
      refundedCents += cents;
    }
  }

  return {
    totalGrossReceivedAmount: fromCents(grossReceivedCents),
    totalRefundedAmount: fromCents(refundedCents),
    totalNetReceivedAmount: fromCents(grossReceivedCents - refundedCents),
  };
}

/**
 * Pure evaluation of a single obligation's standing status.
 * Order of precedence:
 * 1. Waived: Explicit waiver always takes precedence.
 * 2. Settled: Current authoritative verified payment without a recorded refund.
 * 3. Pending Verification: Current pending transfer awaiting Council decision.
 * 4. Unpaid: All other states (no payment, rejected, superseded, or refunded).
 */
export function determineObligationStatus({
  obligation,
  obligationPayments,
  refundedReceiptIds,
}: {
  obligation: Pick<ObligationDTO, "id" | "waived_at">;
  obligationPayments: PaymentStandingRecord[];
  refundedReceiptIds: Set<string>;
}): ObligationStandingStatus {
  if (obligation.waived_at !== null) {
    return "waived";
  }

  // Check for authoritative settlement:
  // Must be current, verified, receipt record, and not refunded.
  const hasSettlement = obligationPayments.some(
    (p) =>
      p.record_status === "current" &&
      p.status === "verified" &&
      p.is_receipt_record &&
      (!p.receipt_id || !refundedReceiptIds.has(p.receipt_id))
  );

  if (hasSettlement) {
    return "settled";
  }

  // Check for pending review:
  // Must be current representation with pending status.
  const hasPendingTransfer = obligationPayments.some(
    (p) => p.record_status === "current" && p.status === "pending"
  );

  if (hasPendingTransfer) {
    return "pending_verification";
  }

  return "unpaid";
}

/**
 * Derives the lifecycle standing status for a list of obligations.
 * Enriches each obligation with its computed status and past-semester indicator.
 */
export function calculateObligationsStanding({
  obligations,
  paymentItems,
  payments,
  refunds,
  targetSemesterId,
  priorSemesterIds,
  semesterCodeMap,
}: {
  obligations: ObligationDTO[];
  paymentItems: PaymentAllocationRecord[];
  payments: PaymentStandingRecord[];
  refunds: RefundStandingRecord[];
  targetSemesterId?: string | null;
  priorSemesterIds?: Set<string>;
  semesterCodeMap?: Map<string, string>;
}): ObligationWithStandingDTO[] {
  const refundedReceiptIds = new Set(
    refunds.map((r) => r.receipt_id).filter(Boolean)
  );

  const paymentMap = new Map<string, PaymentStandingRecord>();
  for (const p of payments) {
    paymentMap.set(p.id, p);
  }

  // Map obligation ID -> related payments
  const obligationPaymentsMap = new Map<string, PaymentStandingRecord[]>();
  for (const item of paymentItems) {
    const payment = paymentMap.get(item.payment_id);
    if (!payment) continue;
    const existing = obligationPaymentsMap.get(item.obligation_id) ?? [];
    existing.push(payment);
    obligationPaymentsMap.set(item.obligation_id, existing);
  }

  return obligations.map((obligation) => {
    const relatedPayments = obligationPaymentsMap.get(obligation.id) ?? [];
    const status = determineObligationStatus({
      obligation,
      obligationPayments: relatedPayments,
      refundedReceiptIds,
    });

    const isPastSemester = priorSemesterIds
      ? priorSemesterIds.has(obligation.semester_id)
      : Boolean(targetSemesterId && obligation.semester_id !== targetSemesterId);
    const semesterCode = semesterCodeMap?.get(obligation.semester_id);

    return {
      ...obligation,
      status,
      is_past_semester: isPastSemester,
      ...(semesterCode ? { semester_code: semesterCode } : {}),
    };
  });
}

/**
 * Scopes obligations and payment history to a selected semester while retaining
 * unsettled obligations from prior semesters as collectible carryovers (FL-022 / T-033).
 */
export function scopeFinancialRecordsForSemester({
  obligationsWithStanding,
  payments,
  paymentItems = [],
  targetSemesterId,
  priorSemesterIds,
}: {
  obligationsWithStanding: ObligationWithStandingDTO[];
  payments: PaymentHistoryDTO[];
  paymentItems?: PaymentAllocationRecord[];
  targetSemesterId?: string | null;
  priorSemesterIds?: Set<string>;
}): {
  obligations: ObligationWithStandingDTO[];
  payments: PaymentHistoryDTO[];
} {
  if (!targetSemesterId) {
    return {
      obligations: obligationsWithStanding,
      payments,
    };
  }

  const obligations = obligationsWithStanding.filter((item) => {
    if (item.semester_id === targetSemesterId) {
      return true;
    }
    const isPrior = priorSemesterIds
      ? priorSemesterIds.has(item.semester_id)
      : item.semester_id !== targetSemesterId;
    return (
      isPrior &&
      (item.status === "unpaid" || item.status === "pending_verification")
    );
  });

  // Payments share their obligations' semester, so carryover items need their own older payments kept.
  const carryoverIds = new Set(
    obligations.filter((o) => o.semester_id !== targetSemesterId).map((o) => o.id)
  );
  const carryoverPaymentIds = new Set(
    paymentItems
      .filter((item) => carryoverIds.has(item.obligation_id))
      .map((item) => item.payment_id)
  );
  const scopedPayments = payments.filter(
    (p) => p.semester_id === targetSemesterId || carryoverPaymentIds.has(p.id)
  );

  return {
    obligations,
    payments: scopedPayments,
  };
}

/**
 * Aggregates financial standing totals for a student.
 * Uses integer cents arithmetic to ensure zero precision drift.
 *
 * Rules:
 * - Gross = Total sum of all recorded obligations.
 * - Waived = Sum of obligations officially waived.
 * - Settled = Sum of obligations cleared by verified non-refunded payments.
 * - Pending Verification = Sum of obligations currently under review in pending payments.
 * - Current Semester Payable = Unpaid obligations belonging to the active/target semester.
 * - Prior Semesters Overdue = Unpaid obligations belonging to older semesters that remain collectible.
 * - Total Outstanding Payable = Current Semester Payable + Prior Semesters Overdue.
 */
export function calculateStudentFinancialSummary({
  obligationsWithStanding,
  targetSemesterId,
  payments = [],
}: {
  obligationsWithStanding: ObligationWithStandingDTO[];
  targetSemesterId?: string | null;
  payments?: ReadonlyArray<PaymentMoneyTotalRecord>;
}): StudentFinancialSummaryDTO {
  let grossCents = 0;
  let waivedCents = 0;
  let settledCents = 0;
  let pendingCents = 0;
  let currentPayableCents = 0;
  let priorOverdueCents = 0;

  for (const item of obligationsWithStanding) {
    const cents = toCents(item.amount);
    grossCents += cents;

    switch (item.status) {
      case "waived":
        waivedCents += cents;
        break;
      case "settled":
        settledCents += cents;
        break;
      case "pending_verification":
        pendingCents += cents;
        break;
      case "unpaid": {
        const isPast =
          item.is_past_semester ??
          Boolean(targetSemesterId && item.semester_id !== targetSemesterId);
        if (isPast) {
          priorOverdueCents += cents;
        } else {
          currentPayableCents += cents;
        }
        break;
      }
    }
  }

  const totalOutstandingCents = currentPayableCents + priorOverdueCents;
  // Carryover obligations bring older payments along; money totals count only the selected term's receipts.
  const moneyTotals = calculatePaymentMoneyTotals(
    targetSemesterId
      ? payments.filter((p) => !p.semester_id || p.semester_id === targetSemesterId)
      : payments
  );

  return {
    totalOutstandingPayable: fromCents(totalOutstandingCents),
    currentSemesterPayable: fromCents(currentPayableCents),
    priorSemestersOverduePayable: fromCents(priorOverdueCents),
    totalSettledAmount: fromCents(settledCents),
    totalPendingVerificationAmount: fromCents(pendingCents),
    totalWaivedAmount: fromCents(waivedCents),
    totalGrossObligationsAmount: fromCents(grossCents),
    ...moneyTotals,
  };
}

/** Semesters that started before the target; their unsettled obligations carry over (FL-022). */
export function priorSemesterIdsFor(
  semesters: Array<{ id: string; starts_on: string }>,
  targetSemesterId: string | null
): Set<string> {
  const target = targetSemesterId ? semesters.find((s) => s.id === targetSemesterId) : undefined;
  return new Set(
    semesters
      .filter((s) => s.id !== targetSemesterId && (!target || s.starts_on < target.starts_on))
      .map((s) => s.id)
  );
}

/**
 * Per-student semester summaries for the Council ledger table, using the same standing,
 * carryover scoping and totals as a single student's account.
 */
export function summarizeStudentBalances({
  obligations,
  paymentItems,
  payments,
  refunds,
  targetSemesterId,
  priorSemesterIds,
}: {
  obligations: Array<ObligationDTO & { student_id: string }>;
  paymentItems: PaymentAllocationRecord[];
  payments: PaymentStandingRecord[];
  refunds: RefundStandingRecord[];
  targetSemesterId: string;
  priorSemesterIds: Set<string>;
}): Map<string, StudentFinancialSummaryDTO> {
  const studentOf = new Map(obligations.map((o) => [o.id, o.student_id]));
  const { obligations: scoped } = scopeFinancialRecordsForSemester({
    obligationsWithStanding: calculateObligationsStanding({
      obligations,
      paymentItems,
      payments,
      refunds,
      targetSemesterId,
      priorSemesterIds,
    }),
    payments: [],
    targetSemesterId,
    priorSemesterIds,
  });

  const byStudent = new Map<string, ObligationWithStandingDTO[]>();
  for (const item of scoped) {
    const studentId = studentOf.get(item.id)!;
    byStudent.set(studentId, [...(byStudent.get(studentId) ?? []), item]);
  }
  return new Map(
    [...byStudent].map(([studentId, items]) => [
      studentId,
      calculateStudentFinancialSummary({ obligationsWithStanding: items, targetSemesterId }),
    ])
  );
}

/**
 * Enriches raw payment rows with external refund status and optional semester codes.
 */
export function mapPaymentHistory({
  payments,
  refunds,
  semesterCodeMap,
  paymentItems = [],
  obligations = [],
}: {
  payments: Array<Omit<PaymentHistoryDTO, "is_refunded" | "refunded_at" | "refund_reason" | "semester_code" | "items" | "replaced_by_payment_id" | "original_decision">>;
  refunds: RefundStandingRecord[];
  semesterCodeMap?: Map<string, string>;
  paymentItems?: ReadonlyArray<{ payment_id: string; obligation_id: string }>;
  obligations?: ReadonlyArray<{ id: string; description: string; amount: number | string }>;
}): PaymentHistoryDTO[] {
  const refundMap = new Map<string, RefundStandingRecord>();
  for (const r of refunds) {
    if (r.receipt_id) {
      refundMap.set(r.receipt_id, r);
    }
  }

  // Items always equal their obligation's full amount (enforced by the payment commands).
  const obligationMap = new Map(obligations.map((o) => [o.id, o]));
  const itemsByPayment = new Map<string, PaymentHistoryDTO["items"]>();
  for (const item of paymentItems) {
    const obligation = obligationMap.get(item.obligation_id);
    if (!obligation) continue;
    const list = itemsByPayment.get(item.payment_id) ?? [];
    list.push({
      obligation_id: obligation.id,
      description: obligation.description,
      amount: Number(obligation.amount),
    });
    itemsByPayment.set(item.payment_id, list);
  }

  // A superseded record's replacement is the row whose supersedes link points at it (FL-028).
  const replacedBy = new Map<string, string>();
  const byId = new Map(payments.map((p) => [p.id, p]));
  for (const p of payments) {
    if (p.supersedes_payment_id) replacedBy.set(p.supersedes_payment_id, p.id);
  }
  // correct_payment overwrites decision fields with the correction, so the original
  // decision lives on the first record of the chain.
  const originalDecision = (p: (typeof payments)[number]) => {
    let root = p;
    for (let i = 0; i < payments.length && root.supersedes_payment_id; i++) {
      const prev = byId.get(root.supersedes_payment_id);
      if (!prev) break;
      root = prev;
    }
    return root === p ? null : { decided_at: root.decided_at, decision_reason: root.decision_reason };
  };

  return payments.map((p) => {
    const refund = p.receipt_id ? refundMap.get(p.receipt_id) : undefined;
    const semesterCode = semesterCodeMap?.get(p.semester_id);

    return {
      ...p,
      items: itemsByPayment.get(p.id) ?? [],
      is_refunded: Boolean(refund),
      refunded_at: refund?.refunded_at ?? null,
      refund_reason: refund?.reason ?? null,
      replaced_by_payment_id: replacedBy.get(p.id) ?? null,
      original_decision: originalDecision(p),
      ...(semesterCode ? { semester_code: semesterCode } : {}),
    };
  });
}

/**
 * Previews a payment correction (FL-028 / T-039) in integer cents so the dialog and tests agree
 * with the database, which derives the replacement amount from the complete new item selection.
 * - `unchanged`: the replacement selects exactly the current obligations (the database refuses it).
 * - `refundMismatch`: a fully refunded receipt needs a replacement total equal to the refund.
 * A correction never moves money, so the difference is informational only.
 */
export function previewPaymentCorrection({
  currentItems,
  replacementItems,
  refundedAmount = null,
}: {
  currentItems: ReadonlyArray<{ obligation_id: string; amount: number | string }>;
  replacementItems: ReadonlyArray<{ obligation_id: string; amount: number | string }>;
  refundedAmount?: number | string | null;
}): {
  currentTotal: number;
  replacementTotal: number;
  difference: number;
  unchanged: boolean;
  refundMismatch: boolean;
} {
  const sumCents = (items: ReadonlyArray<{ amount: number | string }>) =>
    items.reduce((sum, item) => sum + toCents(Number(item.amount)), 0);
  const currentCents = sumCents(currentItems);
  const replacementCents = sumCents(replacementItems);

  const currentIds = new Set(currentItems.map((item) => item.obligation_id));
  const replacementIds = new Set(replacementItems.map((item) => item.obligation_id));
  const unchanged =
    currentIds.size === replacementIds.size &&
    [...currentIds].every((id) => replacementIds.has(id));

  return {
    currentTotal: fromCents(currentCents),
    replacementTotal: fromCents(replacementCents),
    difference: fromCents(replacementCents - currentCents),
    unchanged,
    refundMismatch:
      refundedAmount !== null && toCents(Number(refundedAmount)) !== replacementCents,
  };
}

/**
 * Computes candidate obligations for replacing a payment's item allocation (FL-028 / T-039).
 * Standing is evaluated without the target payment's own settlement so obligations currently
 * covered only by the target appear as `unpaid` (selectable) unless waived, settled by another
 * payment, or on a current pending transfer.
 * - For a settling payment (verified, unrefunded): returns `unpaid` (selectable) and
 *   `pending_verification` (visible but blocked until the transfer is decided).
 * - For a refunded payment: `correct_payment` does not settle debt, so waived or later-settled
 *   obligations in the same semester also remain selectable; only `pending_verification` is blocked.
 */
export function selectPaymentCorrectionOptions({
  obligations,
  paymentItems,
  payments,
  refunds,
  targetPaymentId,
  targetSemesterId,
  isTargetRefunded,
  targetStatus,
  semesterCodeMap,
}: {
  obligations: ObligationDTO[];
  paymentItems: PaymentAllocationRecord[];
  payments: PaymentStandingRecord[];
  refunds: RefundStandingRecord[];
  targetPaymentId: string;
  targetSemesterId: string;
  isTargetRefunded: boolean;
  targetStatus: string;
  semesterCodeMap?: Map<string, string>;
}): ObligationWithStandingDTO[] {
  const standing = calculateObligationsStanding({
    obligations,
    paymentItems: paymentItems.filter((item) => item.payment_id !== targetPaymentId),
    payments,
    refunds,
    targetSemesterId,
    semesterCodeMap,
  });

  const isSettlingPayment = targetStatus === "verified" && !isTargetRefunded;
  if (!isSettlingPayment) {
    return standing;
  }

  return standing.filter(
    (item) => item.status === "unpaid" || item.status === "pending_verification"
  );
}
