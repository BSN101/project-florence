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

export const phDateTimeFormatter = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

export function formatPhDate(isoString: string): string {
  try {
    return phDateFormatter.format(new Date(isoString));
  } catch {
    return isoString;
  }
}

export function formatPhDateTime(isoString: string): string {
  try {
    return phDateTimeFormatter.format(new Date(isoString));
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
  semesterCodeMap,
}: {
  obligations: ObligationDTO[];
  paymentItems: PaymentAllocationRecord[];
  payments: PaymentStandingRecord[];
  refunds: RefundStandingRecord[];
  targetSemesterId?: string | null;
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

    const isPastSemester = Boolean(
      targetSemesterId && obligation.semester_id !== targetSemesterId
    );
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
}: {
  obligationsWithStanding: ObligationWithStandingDTO[];
  targetSemesterId?: string | null;
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
        const isPast = Boolean(
          targetSemesterId && item.semester_id !== targetSemesterId
        );
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

  return {
    totalOutstandingPayable: fromCents(totalOutstandingCents),
    currentSemesterPayable: fromCents(currentPayableCents),
    priorSemestersOverduePayable: fromCents(priorOverdueCents),
    totalSettledAmount: fromCents(settledCents),
    totalPendingVerificationAmount: fromCents(pendingCents),
    totalWaivedAmount: fromCents(waivedCents),
    totalGrossObligationsAmount: fromCents(grossCents),
  };
}

/**
 * Enriches raw payment rows with external refund status and optional semester codes.
 */
export function mapPaymentHistory({
  payments,
  refunds,
  semesterCodeMap,
}: {
  payments: Array<Omit<PaymentHistoryDTO, "is_refunded" | "refunded_at" | "refund_reason" | "semester_code">>;
  refunds: RefundStandingRecord[];
  semesterCodeMap?: Map<string, string>;
}): PaymentHistoryDTO[] {
  const refundMap = new Map<string, RefundStandingRecord>();
  for (const r of refunds) {
    if (r.receipt_id) {
      refundMap.set(r.receipt_id, r);
    }
  }

  return payments.map((p) => {
    const refund = p.receipt_id ? refundMap.get(p.receipt_id) : undefined;
    const semesterCode = semesterCodeMap?.get(p.semester_id);

    return {
      ...p,
      is_refunded: Boolean(refund),
      refunded_at: refund?.refunded_at ?? null,
      refund_reason: refund?.reason ?? null,
      ...(semesterCode ? { semester_code: semesterCode } : {}),
    };
  });
}
