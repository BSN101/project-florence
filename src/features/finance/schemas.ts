import { z } from "zod";

const definitionName = z
  .string()
  .trim()
  .min(1, "Name cannot be empty")
  .max(100, "Name cannot exceed 100 characters");

const definitionAmount = z.coerce
  .number("Amount must be a number")
  .positive("Amount must be greater than zero")
  .max(9999999.99, "Amount exceeds maximum permitted value")
  .refine(
    (val) => Number.isFinite(val) && /^\d+(?:\.\d{1,2})?$/.test(String(val)),
    { message: "Amount can have at most 2 decimal places" }
  );

const definitionId = z.string().uuid("Invalid definition identifier");

// Fee and fine definitions share identical validation rules.
export const createDefinitionSchema = z.object({
  name: definitionName,
  amount: definitionAmount,
});

export const updateDefinitionSchema = z.object({
  id: definitionId,
  name: definitionName,
  amount: definitionAmount,
});

export const archiveDefinitionSchema = z.object({
  id: definitionId,
});

export const YEAR_LEVELS = [1, 2, 3, 4] as const;
export type YearLevel = (typeof YEAR_LEVELS)[number];

export const ACADEMIC_STATUSES = ["regular", "irregular"] as const;
export type AcademicStatus = (typeof ACADEMIC_STATUSES)[number];

export const feeAudienceYearLevelsSchema = z
  .array(z.number().int().min(1).max(4))
  .min(1, "Select at least one year level")
  .refine((arr) => new Set(arr).size === arr.length, {
    message: "Duplicate year levels are not permitted",
  });

export const feeAudienceAcademicStatusesSchema = z
  .array(z.enum(ACADEMIC_STATUSES))
  .min(1, "Select at least one academic status")
  .refine((arr) => new Set(arr).size === arr.length, {
    message: "Duplicate academic statuses are not permitted",
  });

export const previewFeeObligationsSchema = z.object({
  feeDefinitionId: definitionId,
  semesterId: z.string().uuid("Invalid semester identifier"),
  yearLevels: feeAudienceYearLevelsSchema,
  academicStatuses: feeAudienceAcademicStatusesSchema,
});

export const publishFeeObligationsSchema = previewFeeObligationsSchema.extend({
  requestKey: z.string().uuid("Invalid request key").optional(),
});

export type CreateDefinitionInput = z.infer<typeof createDefinitionSchema>;
export type UpdateDefinitionInput = z.infer<typeof updateDefinitionSchema>;
export type ArchiveDefinitionInput = z.infer<typeof archiveDefinitionSchema>;
export type PreviewFeeObligationsInput = z.infer<typeof previewFeeObligationsSchema>;
export type PublishFeeObligationsInput = z.infer<typeof publishFeeObligationsSchema>;

export const PAYMENT_ACCOUNT_QR_MAX_BYTES = 2 * 1024 * 1024;

export const paymentAccountQrFileIdSchema = z
  .string()
  .uuid("Invalid QR code file identifier.");

const accountLabel = z
  .string()
  .trim()
  .min(1, "Destination label cannot be empty")
  .max(100, "Destination label cannot exceed 100 characters");

const accountName = z
  .string()
  .trim()
  .min(1, "Account name cannot be empty")
  .max(100, "Account name cannot exceed 100 characters");

const accountReference = z
  .string()
  .trim()
  .min(1, "Account number cannot be empty")
  .max(100, "Account number cannot exceed 100 characters")
  // GCash numbers are 11 digits and institutional bank accounts at least 10; separators don't count.
  .refine((value) => value.replace(/\D/g, "").length >= 10, "Account number must have at least 10 digits");

// Absent means "leave unchanged" on update; null or "" removes the QR.
const accountQrFileId = z.preprocess(
  (val) => (val === "" ? null : val),
  paymentAccountQrFileIdSchema.nullable().optional()
);

const accountId = z.string().uuid("Invalid payment account identifier");

export const createPaymentAccountSchema = z.object({
  label: accountLabel,
  accountName: accountName,
  accountReference,
  qrFileId: accountQrFileId.optional(),
});

export const updatePaymentAccountSchema = createPaymentAccountSchema.extend({
  id: accountId,
  // The values the editor loaded; the update applies only if the row still has them.
  expected: z.object({
    label: z.string(),
    accountName: z.string(),
    accountReference: z.string(),
    qrFileId: paymentAccountQrFileIdSchema.nullable(),
  }),
});

export const archivePaymentAccountSchema = z.object({
  id: accountId,
});

export type CreatePaymentAccountInput = z.infer<typeof createPaymentAccountSchema>;
export type UpdatePaymentAccountInput = z.infer<typeof updatePaymentAccountSchema>;
export type ArchivePaymentAccountInput = z.infer<typeof archivePaymentAccountSchema>;

/**
 * Query input validation for council inspection of a student's financial account (FL-022 / T-033).
 */
export const councilStudentFinancialQuerySchema = z.object({
  studentId: z.string().uuid("Invalid student identifier"),
  semesterId: z.string().uuid("Invalid semester identifier").nullable().optional(),
});

export type CouncilStudentFinancialQueryInput = z.infer<
  typeof councilStudentFinancialQuerySchema
>;

export const PAYMENT_PROOF_MAX_BYTES = 4 * 1024 * 1024;

export const paymentProofFileIdSchema = z
  .string()
  .uuid("Invalid payment proof file identifier");

const transferReferenceNumber = z
  .string()
  .trim()
  .min(1, "Transfer reference number cannot be empty")
  .max(120, "Transfer reference number cannot exceed 120 characters")
  .refine(
    (value) => value.replace(/[^a-zA-Z0-9]/g, "").length >= 6,
    "Transfer reference number must contain at least 6 letters or digits"
  );

const selectedObligationIds = z
  .array(z.string().uuid("Invalid obligation identifier"))
  .min(1, "Select at least one obligation to pay")
  .max(10000, "Too many obligations selected")
  .refine((arr) => new Set(arr).size === arr.length, {
    message: "Duplicate obligations are not permitted",
  });

/**
 * Input validation for student transfer evidence submission (FL-023 / T-034).
 * Covers one semester and complete selected obligations only.
 */
export const submitTransferSchema = z.object({
  semesterId: z.string().uuid("Invalid semester identifier"),
  obligationIds: selectedObligationIds,
  paymentAccountId: z.string().uuid("Select a destination payment account"),
  referenceNumber: transferReferenceNumber,
  proofFileId: paymentProofFileIdSchema,
  requestKey: z.string().uuid("Invalid request key"),
});

export type SubmitTransferInput = z.infer<typeof submitTransferSchema>;

const cashReceivedAt = z.iso
  .datetime({ offset: true, message: "Invalid receipt date and time" })
  .refine((val) => Date.parse(val) <= Date.now(), {
    message: "Receipt time cannot be in the future",
  });

/**
 * Input validation for recording an in-person cash payment (FL-024 / T-035).
 * Covers one student, one semester, complete selected obligations, and actual receipt time.
 */
export const recordCashPaymentSchema = z.object({
  studentId: z.string().uuid("Invalid student identifier"),
  semesterId: z.string().uuid("Invalid semester identifier"),
  obligationIds: selectedObligationIds,
  receivedAt: cashReceivedAt,
  requestKey: z.string().uuid("Invalid request key"),
});

export type RecordCashPaymentInput = z.infer<typeof recordCashPaymentSchema>;

const decisionReason = z
  .string()
  .trim()
  .min(1, "Enter the reason for the decision")
  .max(500, "Reason cannot exceed 500 characters");

const decisionMoment = (message: string) =>
  z.iso
    .datetime({ offset: true, message })
    .refine((val) => Date.parse(val) <= Date.now(), {
      message: "Time cannot be in the future",
    });

const transferDecisionBase = {
  paymentId: z.string().uuid("Invalid payment identifier"),
  requestKey: z.string().uuid("Invalid request key"),
  // Operator attestation that they checked actual receipt (or return) of funds.
  factsConfirmed: z.literal(true, {
    error: "Confirm that you checked the actual receipt of funds",
  }),
};

/**
 * Input validation for verifying or rejecting a transfer submission (FL-025 / T-036).
 * Mirrors the verify_payment decision modes; the database re-checks every rule.
 * - received: verify a new actual receipt.
 * - no_receipt: reject because no money was received.
 * - duplicate: reject duplicate proof of a transfer already receipted.
 * - returned: reject a new actual transfer that was received and fully returned.
 */
export const transferDecisionSchema = z.discriminatedUnion("mode", [
  z.object({
    ...transferDecisionBase,
    mode: z.literal("received"),
    receivedAt: decisionMoment("Invalid receipt date and time"),
  }),
  z.object({
    ...transferDecisionBase,
    mode: z.literal("no_receipt"),
    reason: decisionReason,
  }),
  z.object({
    ...transferDecisionBase,
    mode: z.literal("duplicate"),
    reason: decisionReason,
    existingReceiptId: z.string().uuid("Select the existing receipt"),
  }),
  z
    .object({
      ...transferDecisionBase,
      mode: z.literal("returned"),
      reason: decisionReason,
      receivedAt: decisionMoment("Invalid receipt date and time"),
      refundedAt: decisionMoment("Invalid refund date and time"),
    })
    .refine((val) => Date.parse(val.refundedAt) >= Date.parse(val.receivedAt), {
      message: "Refund cannot be earlier than the receipt",
      path: ["refundedAt"],
    }),
]);

export type TransferDecisionInput = z.infer<typeof transferDecisionSchema>;

const waiverReason = z
  .string()
  .trim()
  .min(1, "Enter the reason for the waiver")
  .max(500, "Reason cannot exceed 500 characters");

/**
 * Input validation for waiving an unpaid obligation (FL-026 / T-037).
 * Covers unpaid fee/fine waivers and obligation cancellations with attributable context.
 */
export const waiveObligationSchema = z.object({
  obligationId: z.string().uuid("Invalid obligation identifier"),
  reason: waiverReason,
  requestKey: z.string().uuid("Invalid request key"),
});

export type WaiveObligationInput = z.infer<typeof waiveObligationSchema>;

