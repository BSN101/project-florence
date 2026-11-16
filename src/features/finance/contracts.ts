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
  semester_code?: string;
  is_refunded: boolean;
  refunded_at?: string | null;
  refund_reason?: string | null;
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
 * Derived from payment_accounts; includes a short-lived signed QR URL when available.
 */
export type StudentPaymentAccountDTO = Pick<
  Tables["payment_accounts"]["Row"],
  | "id"
  | "label"
  | "account_name"
  | "account_reference"
  | "instructions"
  | "qr_file_id"
> & {
  qr_url: string | null;
};

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
 * Pure check enforcing the FL-023 same-semester rule across selected obligations.
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
    if (msg.includes("Request key reused")) {
      return "This submission request conflicted with a previous attempt. Please try again.";
    }
  }
  return fallbackMessage;
}
