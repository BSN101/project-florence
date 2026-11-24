import type { StudentRosterItem } from "@/features/students/contracts";
import type { Database } from "@/server/db/database.types";

type Tables = Database["public"]["Tables"];

/**
 * Client-safe projection for fine definitions.
 * Includes the creator's profile ID for stable attribution.
 */
export type FineDefinitionDTO = Pick<
  Tables["fine_definitions"]["Row"],
  "id" | "name" | "amount" | "archived_at" | "created_by" | "created_at" | "updated_at"
>;

export type FineDefinitionCatalogItem = FineDefinitionDTO & { creator_name: string };

/**
 * Client-safe projection for fee definitions; same shape as the fine catalog.
 */
export type FeeDefinitionDTO = Pick<
  Tables["fee_definitions"]["Row"],
  "id" | "name" | "amount" | "archived_at" | "created_by" | "created_at" | "updated_at"
>;

export type FeeDefinitionCatalogItem = FeeDefinitionDTO & { creator_name: string };

/**
 * Standardized action result for fee and fine definition mutations.
 */
export type DefinitionActionResult =
  | { success: true; id: string; message?: string }
  | { success: false; error: string; issues?: Record<string, string[]> };

/**
 * Standardized action result for payment account mutations (FL-047 / T-032).
 * Reuses the DefinitionActionResult shape to avoid over-duplication.
 */
export type PaymentAccountActionResult = DefinitionActionResult;

/**
 * Client-safe projection for payment accounts (FL-047 / T-032).
 * Picked directly from the database schema to avoid over-duplication.
 * Respects column-level grants: management metadata (created_by) is not exposed to client queries.
 */
export type PaymentAccountDTO = Pick<
  Tables["payment_accounts"]["Row"],
  | "id"
  | "label"
  | "account_name"
  | "account_reference"
  | "qr_file_id"
  | "archived_at"
>;

/**
 * Pure authorization check for payment account management (FL-047 / T-032).
 * Only Council Executives have access; Operations and Representatives do not manage destinations.
 */
export function isAuthorizedPaymentAccountManager(
  councilRole: string | null | undefined
): boolean {
  return councilRole === "executive";
}

/**
 * Pure authorization check for viewing student financial accounts and payment history (FL-022 / T-033).
 * Council Executives and Operations officers may view permitted student financial accounts.
 * Students view their own accounts in the student workspace.
 * Representatives, Faculty, and unauthenticated actors are forbidden.
 */
export function isAuthorizedCouncilFinancialViewer(
  councilRole: string | null | undefined
): boolean {
  return councilRole === "executive" || councilRole === "operations";
}

/**
 * Standing lifecycle states for a single financial obligation (FL-022 / T-033).
 * Derived dynamically from obligations, payment allocations, and refund records.
 */
export type ObligationStandingStatus =
  | "unpaid"
  | "pending_verification"
  | "settled"
  | "waived";

/**
 * Client-safe projection for student financial obligations (FL-022 / T-033).
 * Represents fee or fine debt items, including optional waiver attribution and derived standing.
 */
export type ObligationDTO = Pick<
  Tables["obligations"]["Row"],
  | "id"
  | "semester_id"
  | "kind"
  | "consequence_outcome"
  | "description"
  | "amount"
  | "waived_at"
  | "waiver_reason"
>;

export type ObligationWithStandingDTO = ObligationDTO & {
  status: ObligationStandingStatus;
  semester_code?: string;
  is_past_semester?: boolean;
};

/**
 * Client-safe projection for student payment history entries (FL-022 / T-033).
 * Encompasses transfer submissions, recorded cash payments, receipt metadata, and refund records.
 */
export type PaymentHistoryDTO = Pick<
  Tables["payments"]["Row"],
  | "id"
  | "student_id"
  | "semester_id"
  | "method"
  | "status"
  | "record_status"
  | "receipt_id"
  | "is_receipt_record"
  | "destination_label"
  | "destination_account_name"
  | "destination_account_reference"
  | "reference_number"
  | "amount"
  | "submitted_at"
  | "decided_at"
  | "decision_reason"
> & {
  proof_file_id?: Tables["payments"]["Row"]["proof_file_id"];
  /** Actual receipt time from `payment_receipts`; null until money is recognized. */
  received_at?: string | null;
  /** Obligations this payment covers, for the payment record view. */
  items: Array<{ obligation_id: string; description: string; amount: number }>;
  semester_code?: string;
  is_refunded: boolean;
  refunded_at?: string | null;
  refund_reason?: string | null;
  /** The superseded record this replacement corrects (FL-028); its decision_reason is the correction note. */
  supersedes_payment_id?: string | null;
  /** The replacement that superseded this record, derived from the supersedes links (FL-028). */
  replaced_by_payment_id?: string | null;
  /** On a replacement: the first record's verify/reject decision, which the correction overwrote. */
  original_decision?: { decided_at: string | null; decision_reason: string | null } | null;
};

/**
 * Aggregated financial balance and standing metrics for a student (FL-022 / T-033).
 * Shared across Student and Council views to guarantee mathematical consistency.
 */
export type StudentFinancialSummaryDTO = {
  /** Net collectible amount required to clear all current and prior unpaid obligations */
  totalOutstandingPayable: number;
  /** Payable amount strictly belonging to the currently selected or active semester */
  currentSemesterPayable: number;
  /** Carryover payable balance from previous semesters that remains collectible */
  priorSemestersOverduePayable: number;
  /** Total sum of verified, non-refunded settlements */
  totalSettledAmount: number;
  /** Total sum of payments currently under review (transfers pending council verification) */
  totalPendingVerificationAmount: number;
  /** Total sum of officially waived obligations */
  totalWaivedAmount: number;
  /** Total original debt recorded (gross obligations before waivers and settlements) */
  totalGrossObligationsAmount: number;
  /** Retained gross money actually received across authoritative payment receipts (FL-027) */
  totalGrossReceivedAmount: number;
  /** Retained total amount refunded across completed full-payment refunds (FL-027) */
  totalRefundedAmount: number;
  /** Net money retained after completed refunds (gross received minus refunds) (FL-027) */
  totalNetReceivedAmount: number;
};

/**
 * Complete financial account payload for a student (FL-022 / T-033).
 * Shared across Student fees-and-fines view and Council payments inspection.
 */
export type StudentFinancialAccountData = {
  student: {
    id: string;
    universityId: string | null;
    fullName: string;
  };
  obligations: ObligationWithStandingDTO[];
  summary: StudentFinancialSummaryDTO;
  payments: PaymentHistoryDTO[];
};

/** One row of the Council ledger table: an enrolled student and their semester summary (FL-022). */
export type CouncilFinancialRosterItem = StudentRosterItem & { summary: StudentFinancialSummaryDTO };

/**
 * Defensive error message sanitizer for payment accounts.
 * Eliminates database leakage (SQLSTATEs, table names, schema details) while returning user-safe guidance.
 */
export function sanitizePaymentAccountError(
  error: unknown,
  fallbackMessage = "An unexpected error occurred while saving the payment account. Please try again."
): string {
  if (!error) return fallbackMessage;
  if (typeof error === "object" && error !== null) {
    const err = error as { code?: string; message?: string };
    if (err.code === "42501") {
      return "You do not have permission to modify payment accounts.";
    }
    if (err.code === "23503") {
      return "This operation is restricted because the account is referenced by existing payment records.";
    }
    if (err.message) {
      if (err.message.includes("Invalid payment destination QR purpose")) {
        return "The attached QR code is invalid or not registered for payment accounts.";
      }
    }
  }
  return fallbackMessage;
}

/**
 * Client-safe projection for historical fee publications.
 * Directly derived from the fee_publications table.
 */
export type FeePublicationDTO = Pick<
  Tables["fee_publications"]["Row"],
  | "id"
  | "fee_definition_id"
  | "semester_id"
  | "year_levels"
  | "academic_statuses"
  | "description"
  | "amount"
  | "published_by"
  | "published_at"
>;

export type FeePublicationHistoryItem = FeePublicationDTO & {
  publisher_name?: string;
};

/**
 * Summary DTO when previewing audience fee obligations prior to explicit generation.
 */
export type FeePublicationPreview = {
  totalMatchingStudents: number;
  alreadyObligatedCount: number;
  newObligationsCount: number;
  unitAmount: number;
  totalNewAmount: number;
};

/**
 * Standardized action result for fee publication generation.
 */
export type PublishFeeResult =
  | { success: true; publicationId: string; count: number; message: string }
  | { success: false; error: string; issues?: Record<string, string[]> };

/**
 * Client-safe projection of active payment destination accounts for the student transfer wizard (FL-023 / T-034).
 * Derived from payment_accounts; the QR link is fetched when shown, since signed links expire.
 */
export type StudentPaymentAccountDTO = Pick<
  Tables["payment_accounts"]["Row"],
  | "id"
  | "label"
  | "account_name"
  | "account_reference"
  | "instructions"
  | "qr_file_id"
>;

/**
 * Standardized action result for student transfer evidence submission (FL-023 / T-034).
 */
export type SubmitTransferResult =
  | {
      success: true;
      paymentId: string;
      semesterId: string;
      amount: number;
      message: string;
    }
  | {
      success: false;
      error: string;
      issues?: Record<string, string[]>;
    };

/**
 * Pure check enforcing the FL-023 and FL-024 same-semester rule across selected obligations.
 */
export function hasSameSemesterObligations(
  obligations: ReadonlyArray<{ semester_id: string }>,
  semesterId: string
): boolean {
  return (
    obligations.length > 0 &&
    obligations.every((obligation) => obligation.semester_id === semesterId)
  );
}

/**
 * Defensive error message sanitizer for student transfer submissions (FL-023 / T-034).
 * Strips database internals while surfacing actionable guidance.
 */
export function sanitizeTransferSubmissionError(
  error: unknown,
  fallbackMessage = "Unable to submit transfer evidence. Please review your details and try again."
): string {
  if (!error) return fallbackMessage;
  if (typeof error === "object" && error !== null) {
    const err = error as { code?: string; message?: string };
    const msg = err.message ?? "";
    if (err.code === "42501") {
      return "You are not authorized to submit transfer evidence for this account.";
    }
    if (
      msg.includes("Active payment destination account required") ||
      msg.includes("Active destination snapshot required")
    ) {
      return "The selected payment destination account is no longer active. Please choose another account.";
    }
    if (
      msg.includes("Valid payment proof upload required") ||
      msg.includes("Proof must be the student payment-proof file")
    ) {
      return "The uploaded transfer proof is invalid or unavailable. Please upload the receipt image again.";
    }
    if (msg.includes("Payment items must share beneficiary and semester")) {
      return "All selected obligations must belong to the same semester.";
    }
    if (msg.includes("Selected obligation is waived or already settled")) {
      return "One or more selected obligations have already been settled or waived. Refresh the page and try again.";
    }
    if (msg.includes("Student enrollment in the specified semester required")) {
      return "You must be enrolled in the selected semester to submit a payment for it.";
    }
    if (msg.includes("Selected obligation already has a pending transfer")) {
      return "One or more selected obligations already have a transfer pending Council review.";
    }
    if (msg.includes("Transfer reference already submitted")) {
      return "This reference number has already been submitted.";
    }
    if (msg.includes("Request key reused")) {
      return "This submission request conflicted with a previous attempt. Please try again.";
    }
  }
  return fallbackMessage;
}

/**
 * Standardized action result for recording an in-person cash payment (FL-024 / T-035).
 */
export type RecordCashPaymentResult =
  | {
      success: true;
      paymentId: string;
      receiptId: string;
      semesterId: string;
      amount: number;
      message: string;
    }
  | {
      success: false;
      error: string;
      issues?: Record<string, string[]>;
    };

/**
 * Pure self-benefit check for recording cash payments (FL-024 / T-035).
 * Officers may not record their own cash payment.
 */
export function canRecordCashForStudent(
  actorProfileId: string | null | undefined,
  studentId: string | null | undefined
): boolean {
  return Boolean(
    actorProfileId &&
      studentId &&
      actorProfileId !== studentId
  );
}

/**
 * Defensive error message sanitizer for cash payment recording (FL-024 / T-035).
 * Strips database internals while surfacing actionable guidance.
 */
export function sanitizeCashPaymentError(
  error: unknown,
  fallbackMessage = "Unable to record cash payment. Please review the selected obligations and try again."
): string {
  if (!error) return fallbackMessage;
  if (typeof error === "object" && error !== null) {
    const err = error as { code?: string; message?: string };
    const msg = err.message ?? "";
    if (msg.includes("Self cash recording forbidden")) {
      return "Officers are not permitted to record their own cash payments.";
    }
    if (err.code === "42501") {
      return "You are not authorized to record cash payments.";
    }
    if (msg.includes("Actual receipt time required")) {
      return "Enter a valid receipt date and time that is not in the future.";
    }
    if (msg.includes("Payment items must share beneficiary and semester")) {
      return "All selected obligations must belong to the same student and semester.";
    }
    if (msg.includes("Selected obligation has a pending transfer")) {
      return "One or more selected obligations are on a transfer awaiting review. Verify or reject that transfer first.";
    }
    if (
      msg.includes("Selected obligation is waived or already settled") ||
      msg.includes("Double settlement forbidden") ||
      msg.includes("Cannot settle waived debt")
    ) {
      return "One or more selected obligations have already been settled or waived. Refresh the page and try again.";
    }
    if (msg.includes("Unknown obligation")) {
      return "One or more selected obligations could not be found. Refresh the page and try again.";
    }
    if (msg.includes("Student enrollment in the specified semester required")) {
      return "The student must be enrolled in the selected semester to record a payment for it.";
    }
    if (msg.includes("Request key reused")) {
      return "This payment request conflicted with a previous attempt. Please try again.";
    }
  }
  return fallbackMessage;
}

/**
 * Standardized action result for verifying or rejecting a transfer (FL-025 / T-036).
 */
export type TransferDecisionResult =
  | {
      success: true;
      paymentId: string;
      status: "verified" | "rejected";
      receiptId: string | null;
      message: string;
    }
  | {
      success: false;
      error: string;
      issues?: Record<string, string[]>;
      /** Nothing was committed, so the next attempt must use a new request key. */
      retryWithNewKey?: boolean;
    };

/**
 * Pure self-benefit check for transfer decisions (FL-025 / T-036).
 * Officers may not verify or reject their own transfer submission.
 */
export function canDecideTransferForStudent(
  actorProfileId: string | null | undefined,
  studentId: string | null | undefined
): boolean {
  return Boolean(actorProfileId && studentId && actorProfileId !== studentId);
}

/**
 * Defensive error message sanitizer for transfer decisions (FL-025 / T-036).
 * Strips database internals while surfacing actionable guidance.
 */
export function sanitizeTransferDecisionError(
  error: unknown,
  fallbackMessage = "Unable to record the decision. Please review the details and try again."
): string {
  if (!error) return fallbackMessage;
  if (typeof error === "object" && error !== null) {
    const err = error as { code?: string; message?: string };
    const msg = err.message ?? "";
    if (msg.includes("Self payment decision forbidden")) {
      return "Officers are not permitted to decide their own transfer submissions.";
    }
    if (msg.includes("Only a current pending transfer can be decided")) {
      return "This transfer was already decided. Refresh the page to see its latest status.";
    }
    if (msg.includes("Receipt/return facts must be confirmed")) {
      return "Confirm that you checked the actual receipt of funds before deciding.";
    }
    if (msg.includes("Rejection reason required")) {
      return "Enter the reason for rejecting this transfer.";
    }
    if (msg.includes("Money evidence does not match decision mode")) {
      return "The receipt or refund details do not match the selected decision.";
    }
    if (
      msg.includes("Existing receipt not found") ||
      msg.includes("Receipt has no authorized authoritative representation") ||
      msg.includes("Duplicate receipt beneficiary mismatch")
    ) {
      return "Select an existing receipt that belongs to the same student.";
    }
    // After the message checks: the receipt error above also uses 42501.
    if (err.code === "42501" || msg.includes("Council action not authorized")) {
      return "You are not authorized to verify or reject transfers.";
    }
    if (
      msg.includes("Selected obligation is waived or already settled") ||
      msg.includes("Payment must equal full selected items")
    ) {
      return "The obligations on this transfer have changed or were already settled. Reject it instead, then refresh the page.";
    }
    if (msg.includes("Request key reused")) {
      return "This decision request conflicted with a previous attempt. Please try again.";
    }
    if (msg.includes("Incomplete command receipt")) {
      return "This decision could not be confirmed. Refresh the page to check the transfer's status before retrying.";
    }
  }
  return fallbackMessage;
}

/**
 * An existing receipt the operator may link a duplicate submission to (FL-025 / T-036).
 * Limited to the same student's authoritative receipts.
 */
export type ExistingReceiptOptionDTO = {
  receipt_id: string;
  payment_id: string;
  method: Tables["payments"]["Row"]["method"];
  amount: number;
  reference_number: string | null;
  received_at: string | null;
  is_refunded: boolean;
};

/**
 * Client-safe projection of a transfer awaiting Executive/Operations review (FL-025 / T-036).
 * Carries the proof file id (resolve through getTransferProofUrl), never a storage key or URL.
 */
export type PendingTransferReviewDTO = Pick<
  Tables["payments"]["Row"],
  | "id"
  | "student_id"
  | "semester_id"
  | "destination_label"
  | "destination_account_name"
  | "destination_account_reference"
  | "reference_number"
  | "proof_file_id"
  | "amount"
  | "submitted_at"
> & {
  student: { universityId: string | null; fullName: string };
  items: Array<{ obligation_id: string; description: string; amount: number }>;
  existingReceipts: ExistingReceiptOptionDTO[];
};

/**
 * Standardized action result for waiving an unpaid obligation (FL-026 / T-037).
 */
export type WaiveObligationResult =
  | {
      success: true;
      obligationId: string;
      waivedAt: string;
      message: string;
    }
  | {
      success: false;
      error: string;
      issues?: Record<string, string[]>;
      /** Nothing was committed, so the next attempt must use a new request key. */
      retryWithNewKey?: boolean;
    };

/**
 * Pure self-benefit check for waiving unpaid obligations (FL-026 / T-037).
 * Officers may not waive their own obligations.
 */
export function canWaiveObligationForStudent(
  actorProfileId: string | null | undefined,
  studentId: string | null | undefined
): boolean {
  return Boolean(actorProfileId && studentId && actorProfileId !== studentId);
}

/**
 * Pure eligibility check for whether an obligation can be waived (FL-026 / T-037).
 * Only unpaid obligations may be waived. An obligation on a pending transfer is not waivable:
 * verify_payment would then reject every item on that transfer, so the transfer is decided first.
 */
export function isObligationWaivable(
  obligation: Pick<ObligationWithStandingDTO, "status"> | null | undefined
): boolean {
  return obligation?.status === "unpaid";
}

/**
 * Defensive error message sanitizer for unpaid obligation waivers (FL-026 / T-037).
 * Strips database internals while surfacing actionable guidance.
 */
export function sanitizeWaiveObligationError(
  error: unknown,
  fallbackMessage = "Unable to waive obligation. Please review the details and try again."
): string {
  if (!error) return fallbackMessage;
  if (typeof error === "object" && error !== null) {
    const err = error as { code?: string; message?: string };
    const msg = err.message ?? "";
    if (
      msg.includes("Self debt waiver forbidden") ||
      msg.includes("Self obligation waiver forbidden")
    ) {
      return "Officers are not permitted to waive their own obligations.";
    }
    if (msg.includes("Obligation has a pending transfer")) {
      return "This obligation is on a transfer awaiting review. Verify or reject that transfer first.";
    }
    if (msg.includes("Waiver reason required")) {
      return "Enter the reason for the waiver.";
    }
    if (
      msg.includes("Only unpaid, unwaived obligations may be waived") ||
      msg.includes("Paid obligation cannot be waived")
    ) {
      return "This obligation has already been settled or waived. Refresh the page to see its latest status.";
    }
    if (
      msg.includes("Unknown obligation") ||
      msg.includes("A nonempty unique obligation UUID array")
    ) {
      return "This obligation could not be found. Refresh the page and try again.";
    }
    if (err.code === "42501" || msg.includes("Council action not authorized")) {
      return "You are not authorized to waive obligations.";
    }
    if (msg.includes("Request key reused")) {
      return "This waiver request conflicted with a previous attempt. Please try again.";
    }
    if (msg.includes("Incomplete command receipt")) {
      return "This waiver could not be confirmed. Refresh the page to check the obligation's status before retrying.";
    }
  }
  return fallbackMessage;
}

/**
 * Standardized action result for recording a completed full-payment refund (FL-027 / T-038).
 */
export type RecordRefundResult =
  | {
      success: true;
      refundId: string;
      receiptId: string;
      amount: number;
      message: string;
    }
  | {
      success: false;
      error: string;
      issues?: Record<string, string[]>;
      /** Nothing was committed, so the next attempt must use a new request key. */
      retryWithNewKey?: boolean;
    };

/**
 * Pure self-benefit check for recording payment refunds (FL-027 / T-038).
 * Officers may not record refunds for their own payments.
 */
export function canRecordRefundForStudent(
  actorProfileId: string | null | undefined,
  studentId: string | null | undefined
): boolean {
  return Boolean(actorProfileId && studentId && actorProfileId !== studentId);
}

/**
 * Pure eligibility check for whether a payment record can be refunded (FL-027 / T-038).
 * Only a current, verified, unrefunded authoritative receipt record is eligible.
 */
export function isPaymentRefundable(
  payment:
    | Pick<
        PaymentHistoryDTO,
        "status" | "record_status" | "is_receipt_record" | "receipt_id" | "is_refunded"
      >
    | null
    | undefined
): boolean {
  return Boolean(
    payment &&
      payment.record_status === "current" &&
      payment.status === "verified" &&
      payment.is_receipt_record &&
      payment.receipt_id &&
      !payment.is_refunded
  );
}

/**
 * True only when the database answered with an error (SQLSTATE or PostgREST code), so the command
 * and its request key were rolled back. A dropped connection or gateway page may follow a commit.
 */
export const commandRolledBack = (error: { code?: string } | null) =>
  /^([0-9A-Z]{5}|PGRST\d+)$/.test(error?.code ?? "");

export const UNCONFIRMED_COMMAND_MESSAGE =
  "The connection dropped before this was confirmed. Submit again without changes to check; it won't be recorded twice.";

/**
 * Defensive error message sanitizer for completed refund recording (FL-027 / T-038).
 * Strips database internals while surfacing actionable guidance.
 */
export function sanitizeRecordRefundError(
  error: unknown,
  fallbackMessage = "Unable to record refund. Please review the details and try again."
): string {
  if (!error) return fallbackMessage;
  if (typeof error === "object" && error !== null) {
    const err = error as { code?: string; message?: string };
    const msg = err.message ?? "";
    if (msg.includes("Self refund recording forbidden")) {
      return "Officers are not permitted to record refunds for their own payments.";
    }
    if (msg.includes("Receipt already refunded") || err.code === "23505") {
      return "This payment receipt has already been refunded. Refresh the page to see its latest status.";
    }
    if (msg.includes("Only verified payments can be refunded")) {
      return "Only verified payments can be refunded.";
    }
    if (msg.includes("Invalid receipt/refund chronology")) {
      return "The refund date and time cannot be earlier than when the payment was received.";
    }
    if (msg.includes("Payment receipt not found")) {
      return "This payment receipt could not be found. Refresh the page and try again.";
    }
    if (msg.includes("Actual completed refund time/reason/confirmation required")) {
      return "Provide a valid refund date and time, reason, and confirmation that the full refund was returned.";
    }
    if (
      err.code === "42501" ||
      msg.includes("Council action not authorized") ||
      msg.includes("Refund not authorized")
    ) {
      return "You are not authorized to record payment refunds.";
    }
    if (msg.includes("Request key reused")) {
      return "This refund request conflicted with a previous attempt. Please try again.";
    }
    if (msg.includes("Incomplete command receipt")) {
      return "This refund could not be confirmed. Refresh the page to check the payment's status before retrying.";
    }
  }
  return fallbackMessage;
}


/**
 * Standardized action result for correcting a payment record (FL-028 / T-039).
 * A correction supersedes the old record; it never moves or returns money.
 */
export type CorrectPaymentResult =
  | {
      success: true;
      paymentId: string;
      supersedesPaymentId: string;
      receiptId: string;
      amount: number;
      message: string;
    }
  | {
      success: false;
      error: string;
      issues?: Record<string, string[]>;
      /** Nothing was committed, so the next attempt must use a new request key. */
      retryWithNewKey?: boolean;
    };

/**
 * Pure self-benefit check for correcting payment records (FL-028 / T-039).
 * Officers may not correct their own payments.
 */
export function canCorrectPaymentForStudent(
  actorProfileId: string | null | undefined,
  studentId: string | null | undefined
): boolean {
  return Boolean(actorProfileId && studentId && actorProfileId !== studentId);
}

/**
 * Pure eligibility check for whether a payment record can be corrected (FL-028 / T-039).
 * Only the current authoritative receipt record qualifies. A pending submission has no receipt
 * to correct, and a rejected record is correctable only after its completed full return.
 */
export function isPaymentCorrectable(
  payment:
    | Pick<
        PaymentHistoryDTO,
        "status" | "record_status" | "is_receipt_record" | "receipt_id" | "is_refunded"
      >
    | null
    | undefined
): boolean {
  if (
    !payment ||
    payment.record_status !== "current" ||
    !payment.is_receipt_record ||
    !payment.receipt_id
  ) {
    return false;
  }
  return (
    payment.status === "verified" ||
    (payment.status === "rejected" && payment.is_refunded)
  );
}

/**
 * Defensive error message sanitizer for payment corrections (FL-028 / T-039).
 * Strips database internals while surfacing actionable guidance.
 */
export function sanitizeCorrectPaymentError(
  error: unknown,
  fallbackMessage = "Unable to correct the payment. Please review the details and try again."
): string {
  if (!error) return fallbackMessage;
  if (typeof error === "object" && error !== null) {
    const err = error as { code?: string; message?: string };
    const msg = err.message ?? "";
    if (msg.includes("Self payment correction forbidden")) {
      return "Officers are not permitted to correct their own payments.";
    }
    if (msg.includes("Payment was already corrected")) {
      return "This payment was already corrected. Refresh the page to see the latest record.";
    }
    if (msg.includes("Replacement items match the current record")) {
      return "The replacement has the same obligations as the current record. Change the selection first.";
    }
    if (msg.includes("Selected obligation has a pending transfer")) {
      return "One or more selected obligations are on a transfer awaiting review. Verify or reject that transfer first.";
    }
    if (msg.includes("Correction would invalidate full refund history")) {
      return "This payment was fully refunded, so the corrected total must equal the refunded amount.";
    }
    if (
      msg.includes("Selected obligation is waived or already settled") ||
      msg.includes("Payment items must share beneficiary and semester")
    ) {
      return "One or more selected obligations are waived, already settled, or belong to another student or semester. Refresh the page and try again.";
    }
    if (
      msg.includes("Invalid replacement item selection") ||
      msg.includes("Unknown obligation") ||
      msg.includes("A nonempty unique obligation UUID array")
    ) {
      return "Select valid obligations for the corrected payment. Refresh the page and try again.";
    }
    if (msg.includes("Correction target and a reason of at most 500 characters required")) {
      return "Enter a note of up to 500 characters explaining the correction.";
    }
    if (
      msg.includes("Payment not found") ||
      msg.includes("Correction requires a recognized received payment") ||
      msg.includes("Correction target must be the current authoritative receipt representation") ||
      msg.includes("Received rejected payment must have a completed full return")
    ) {
      return "This payment record can no longer be corrected. Refresh the page to see its latest status.";
    }
    if (err.code === "42501" || msg.includes("Council action not authorized")) {
      return "You are not authorized to correct payments.";
    }
    if (msg.includes("Request key reused")) {
      return "This correction request conflicted with a previous attempt. Please try again.";
    }
    if (msg.includes("Incomplete command receipt")) {
      return "This correction could not be confirmed. Refresh the page to check the payment's status before retrying.";
    }
  }
  return fallbackMessage;
}
