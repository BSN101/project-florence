"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AccessDeniedError, requireWorkspace } from "@/server/auth/require-workspace";
import { createCommandClient } from "@/server/db/command-client";
import { createUserClient } from "@/server/db/user-client";
import { getDownloadUrl, uploadFile, UploadRejectedError } from "@/server/storage/files";

import {
  type CorrectPaymentResult,
  type DefinitionActionResult,
  type FeePublicationPreview,
  type ObligationWithStandingDTO,
  type PaymentAccountActionResult,
  type PublishFeeResult,
  type RecordCashPaymentResult,
  type RecordRefundResult,
  type SubmitTransferResult,
  type TransferDecisionResult,
  type WaiveObligationResult,
  canCorrectPaymentForStudent,
  canDecideTransferForStudent,
  canRecordCashForStudent,
  canRecordRefundForStudent,
  commandRolledBack,
  hasSameSemesterObligations,
  sanitizeCashPaymentError,
  sanitizeCorrectPaymentError,
  sanitizePaymentAccountError,
  sanitizeRecordRefundError,
  sanitizeTransferDecisionError,
  sanitizeTransferSubmissionError,
  sanitizeWaiveObligationError,
  UNCONFIRMED_COMMAND_MESSAGE,
} from "./contracts";
import {
  assertAuthorizedCouncilExecutive,
  assertAuthorizedCouncilManager,
  getCouncilPaymentCorrectionOptions,
  previewFeeObligations,
} from "./queries";
import {
  archiveDefinitionSchema,
  archivePaymentAccountSchema,
  correctPaymentSchema,
  createDefinitionSchema,
  createPaymentAccountSchema,
  paymentAccountQrFileIdSchema,
  paymentProofFileIdSchema,
  publishFeeObligationsSchema,
  recordCashPaymentSchema,
  recordRefundSchema,
  submitTransferSchema,
  transferDecisionSchema,
  updateDefinitionSchema,
  updatePaymentAccountSchema,
  waiveObligationSchema,
  type ArchiveDefinitionInput,
  type ArchivePaymentAccountInput,
  type CorrectPaymentInput,
  type CreateDefinitionInput,
  type CreatePaymentAccountInput,
  type PreviewFeeObligationsInput,
  type PublishFeeObligationsInput,
  type RecordCashPaymentInput,
  type RecordRefundInput,
  type SubmitTransferInput,
  type TransferDecisionInput,
  type UpdateDefinitionInput,
  type UpdatePaymentAccountInput,
  type WaiveObligationInput,
} from "./schemas";

/**
 * Create a new reusable fine definition for event consequences.
 * Authorized for Council Executive and Operations only.
 */
export async function createFineDefinition(
  input: CreateDefinitionInput
): Promise<DefinitionActionResult> {
  try {
    const context = await assertAuthorizedCouncilManager();
    const parsed = createDefinitionSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: "Invalid fine definition input",
        issues: parsed.error.flatten().fieldErrors,
      };
    }

    const now = new Date().toISOString();
    const commandClient = createCommandClient();
    const { data, error } = await commandClient
      .from("fine_definitions")
      .insert({
        name: parsed.data.name,
        amount: parsed.data.amount,
        created_by: context.profile.id,
        updated_at: now,
      })
      .select("id")
      .single();

    if (error || !data) {
      return {
        success: false,
        error: error?.message ?? "Failed to create fine definition",
      };
    }

    revalidatePath("/council/fees-and-fines");
    return {
      success: true,
      id: data.id,
      message: "Fine definition created successfully",
    };
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return {
        success: false,
        error: "Unauthorized: Only Council Executives and Operations may create fine definitions",
      };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "An unexpected error occurred",
    };
  }
}

/**
 * Edit an active fine definition.
 * Future-use edits do not silently rewrite generated student obligations.
 * Authorized for Council Executive and Operations only.
 */
export async function updateFineDefinition(
  input: UpdateDefinitionInput
): Promise<DefinitionActionResult> {
  try {
    await assertAuthorizedCouncilManager();
    const parsed = updateDefinitionSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: "Invalid fine definition input",
        issues: parsed.error.flatten().fieldErrors,
      };
    }

    const commandClient = createCommandClient();

    const { data: existing, error: fetchError } = await commandClient
      .from("fine_definitions")
      .select("id, archived_at")
      .eq("id", parsed.data.id)
      .maybeSingle();

    if (fetchError || !existing) {
      return { success: false, error: "Fine definition not found" };
    }
    if (existing.archived_at !== null) {
      return { success: false, error: "Archived fine definitions cannot be modified" };
    }

    const { data: updated, error: updateError } = await commandClient
      .from("fine_definitions")
      .update({
        name: parsed.data.name,
        amount: parsed.data.amount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", parsed.data.id)
      .is("archived_at", null)
      .select("id")
      .maybeSingle();

    if (updateError) {
      return { success: false, error: updateError.message };
    }
    if (!updated) {
      return { success: false, error: "Fine definition is no longer active. Refresh and try again." };
    }

    revalidatePath("/council/fees-and-fines");
    return {
      success: true,
      id: parsed.data.id,
      message: "Fine definition updated successfully",
    };
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return {
        success: false,
        error: "Unauthorized: Only Council Executives and Operations may edit fine definitions",
      };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "An unexpected error occurred",
    };
  }
}

/**
 * Soft-archive a fine definition to retire it from future event configuration.
 * Existing event consequence rules and student obligations remain untouched.
 * Authorized for Council Executive and Operations only.
 */
export async function archiveFineDefinition(
  input: ArchiveDefinitionInput
): Promise<DefinitionActionResult> {
  try {
    await assertAuthorizedCouncilManager();
    const parsed = archiveDefinitionSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Invalid fine definition identifier" };
    }

    const commandClient = createCommandClient();

    const { data: existing, error: fetchError } = await commandClient
      .from("fine_definitions")
      .select("id, archived_at")
      .eq("id", parsed.data.id)
      .maybeSingle();

    if (fetchError || !existing) {
      return { success: false, error: "Fine definition not found" };
    }
    if (existing.archived_at !== null) {
      return { success: false, error: "Fine definition is already archived" };
    }

    const now = new Date().toISOString();
    const { data: archived, error: archiveError } = await commandClient
      .from("fine_definitions")
      .update({
        archived_at: now,
        updated_at: now,
      })
      .eq("id", parsed.data.id)
      .is("archived_at", null)
      .select("id")
      .maybeSingle();

    if (archiveError) {
      return { success: false, error: archiveError.message };
    }
    if (!archived) {
      return { success: false, error: "Fine definition is already archived. Refresh and try again." };
    }

    revalidatePath("/council/fees-and-fines");
    return {
      success: true,
      id: parsed.data.id,
      message: "Fine definition archived successfully",
    };
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return {
        success: false,
        error: "Unauthorized: Only Council Executives and Operations may archive fine definitions",
      };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "An unexpected error occurred",
    };
  }
}

/**
 * Create a reusable fee definition for future fee publication.
 * Authorized for Council Executive and Operations only.
 */
export async function createFeeDefinition(
  input: CreateDefinitionInput
): Promise<DefinitionActionResult> {
  try {
    const context = await assertAuthorizedCouncilManager();
    const parsed = createDefinitionSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: "Invalid fee definition input",
        issues: parsed.error.flatten().fieldErrors,
      };
    }

    const commandClient = createCommandClient();
    const { data, error } = await commandClient
      .from("fee_definitions")
      .insert({
        name: parsed.data.name,
        amount: parsed.data.amount,
        created_by: context.profile.id,
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !data) {
      return { success: false, error: error?.message ?? "Failed to create fee definition" };
    }

    revalidatePath("/council/fees-and-fines");
    return { success: true, id: data.id, message: "Fee definition created successfully" };
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return {
        success: false,
        error: "Unauthorized: Only Council Executives and Operations may create fee definitions",
      };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "An unexpected error occurred",
    };
  }
}

/**
 * Edit an active fee definition's name and amount.
 * Affects future publications only; existing publications and obligations keep
 * their own snapshot and are never touched here.
 * Authorized for Council Executive and Operations only.
 */
export async function updateFeeDefinition(
  input: UpdateDefinitionInput
): Promise<DefinitionActionResult> {
  try {
    await assertAuthorizedCouncilManager();
    const parsed = updateDefinitionSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: "Invalid fee definition input",
        issues: parsed.error.flatten().fieldErrors,
      };
    }

    const commandClient = createCommandClient();

    const { data: existing, error: fetchError } = await commandClient
      .from("fee_definitions")
      .select("id, archived_at")
      .eq("id", parsed.data.id)
      .maybeSingle();

    if (fetchError || !existing) {
      return { success: false, error: "Fee definition not found" };
    }
    if (existing.archived_at !== null) {
      return { success: false, error: "Archived fee definitions cannot be modified" };
    }

    const { data: updated, error: updateError } = await commandClient
      .from("fee_definitions")
      .update({
        name: parsed.data.name,
        amount: parsed.data.amount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", parsed.data.id)
      .is("archived_at", null)
      .select("id")
      .maybeSingle();

    if (updateError) {
      return { success: false, error: updateError.message };
    }
    if (!updated) {
      return { success: false, error: "Fee definition is no longer active. Refresh and try again." };
    }

    revalidatePath("/council/fees-and-fines");
    return { success: true, id: parsed.data.id, message: "Fee definition updated successfully" };
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return {
        success: false,
        error: "Unauthorized: Only Council Executives and Operations may edit fee definitions",
      };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "An unexpected error occurred",
    };
  }
}

/**
 * Soft-archive a fee definition so it cannot be used for new publications.
 * Existing publications and student obligations remain untouched.
 * Authorized for Council Executive and Operations only.
 */
export async function archiveFeeDefinition(
  input: ArchiveDefinitionInput
): Promise<DefinitionActionResult> {
  try {
    await assertAuthorizedCouncilManager();
    const parsed = archiveDefinitionSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Invalid fee definition identifier" };
    }

    const commandClient = createCommandClient();

    const { data: existing, error: fetchError } = await commandClient
      .from("fee_definitions")
      .select("id, archived_at")
      .eq("id", parsed.data.id)
      .maybeSingle();

    if (fetchError || !existing) {
      return { success: false, error: "Fee definition not found" };
    }
    if (existing.archived_at !== null) {
      return { success: false, error: "Fee definition is already archived" };
    }

    const now = new Date().toISOString();
    const { data: archived, error: archiveError } = await commandClient
      .from("fee_definitions")
      .update({ archived_at: now, updated_at: now })
      .eq("id", parsed.data.id)
      .is("archived_at", null)
      .select("id")
      .maybeSingle();

    if (archiveError) {
      return { success: false, error: archiveError.message };
    }
    if (!archived) {
      return { success: false, error: "Fee definition is already archived. Refresh and try again." };
    }

    revalidatePath("/council/fees-and-fines");
    return { success: true, id: parsed.data.id, message: "Fee definition archived successfully" };
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return {
        success: false,
        error: "Unauthorized: Only Council Executives and Operations may archive fee definitions",
      };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "An unexpected error occurred",
    };
  }
}

/**
 * Publish fee obligations to enrolled students based on audience criteria (FL-021 / T-031).
 * Deduplication, snapshot creation, and notification triggers are atomically performed by the database RPC.
 * Authorized for Council Executive and Operations only.
 */
export async function publishFeeObligations(
  input: PublishFeeObligationsInput
): Promise<PublishFeeResult> {
  try {
    const context = await assertAuthorizedCouncilManager();
    const parsed = publishFeeObligationsSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: "Invalid fee publication input",
        issues: parsed.error.flatten().fieldErrors,
      };
    }

    const requestKey = parsed.data.requestKey ?? randomUUID();
    const commandClient = createCommandClient();

    const { data, error } = await commandClient.rpc("publish_fee_obligations", {
      p_key: requestKey,
      p_actor: context.profile.id,
      p_fee: parsed.data.feeDefinitionId,
      p_semester: parsed.data.semesterId,
      p_year_levels: parsed.data.yearLevels,
      p_academic_statuses: parsed.data.academicStatuses,
    });

    if (error) {
      if (error.code === "42501") {
        return { success: false, error: "You are not permitted to publish fee obligations." };
      }
      if (error.message === "Active fee definition required") {
        return { success: false, error: "This fee definition is no longer active. Refresh and choose another." };
      }
      return { success: false, error: "Fee obligations could not be published. Please try again." };
    }

    const result = data as { publication_id: string; obligation_count: number } | null;
    if (!result?.publication_id) {
      return { success: false, error: "Fee publication returned no result. Check the publication history before retrying." };
    }
    const count = result.obligation_count;
    const publicationId = result.publication_id;

    revalidatePath("/council/fees-and-fines");
    return {
      success: true,
      publicationId,
      count,
      message: `Fee obligations published successfully to ${count} student${count === 1 ? "" : "s"}.`,
    };
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return {
        success: false,
        error: "Unauthorized: Only Council Executives and Operations may publish fee obligations",
      };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "An unexpected error occurred",
    };
  }
}

/**
 * Server action to preview audience obligation metrics before publishing.
 * Authorized for Council Executive and Operations only.
 */
export async function previewFeeAudience(
  input: PreviewFeeObligationsInput
): Promise<
  | { success: true; preview: FeePublicationPreview }
  | { success: false; error: string }
> {
  try {
    const preview = await previewFeeObligations(input);
    return { success: true, preview };
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return {
        success: false,
        error: "Unauthorized: Only Council Executives and Operations may preview fee obligations",
      };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load preview",
    };
  }
}

/**
 * Create a new transfer destination account.
 * Authorized for Council Executives only; Operations and Representatives are forbidden.
 */
export async function createPaymentAccount(
  input: CreatePaymentAccountInput
): Promise<PaymentAccountActionResult> {
  try {
    const context = await assertAuthorizedCouncilExecutive();
    const parsed = createPaymentAccountSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: "Invalid payment account input",
        issues: parsed.error.flatten().fieldErrors,
      };
    }

    const now = new Date().toISOString();
    const commandClient = createCommandClient();
    const { data, error } = await commandClient
      .from("payment_accounts")
      .insert({
        label: parsed.data.label,
        account_name: parsed.data.accountName,
        account_reference: parsed.data.accountReference,
        qr_file_id: parsed.data.qrFileId ?? null,
        created_by: context.profile.id,
        updated_at: now,
      })
      .select("id")
      .single();

    if (error || !data) {
      return {
        success: false,
        error: sanitizePaymentAccountError(error, "Failed to create payment account. Please try again."),
      };
    }

    revalidatePath("/council/payment-accounts");
    return {
      success: true,
      id: data.id,
      message: "Payment account created successfully",
    };
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return {
        success: false,
        error: "Unauthorized: Only Council Executives may manage payment accounts",
      };
    }
    return {
      success: false,
      error: "An unexpected error occurred while saving the payment account. Please try again.",
    };
  }
}

/**
 * Edit an active transfer destination account.
 * Existing student submissions retain their point-in-time snapshot and are not rewritten.
 * Authorized for Council Executives only; Operations and Representatives are forbidden.
 */
export async function updatePaymentAccount(
  input: UpdatePaymentAccountInput
): Promise<PaymentAccountActionResult> {
  try {
    await assertAuthorizedCouncilExecutive();
    const parsed = updatePaymentAccountSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: "Invalid payment account input",
        issues: parsed.error.flatten().fieldErrors,
      };
    }

    const { expected } = parsed.data;
    const commandClient = createCommandClient();

    let update = commandClient
      .from("payment_accounts")
      .update({
        label: parsed.data.label,
        account_name: parsed.data.accountName,
        account_reference: parsed.data.accountReference,
        ...(parsed.data.qrFileId !== undefined && { qr_file_id: parsed.data.qrFileId }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", parsed.data.id)
      .is("archived_at", null)
      .eq("label", expected.label)
      .eq("account_name", expected.accountName)
      .eq("account_reference", expected.accountReference);
    update = expected.qrFileId === null ? update.is("qr_file_id", null) : update.eq("qr_file_id", expected.qrFileId);
    const { data: updated, error: updateError } = await update.select("id").maybeSingle();

    if (updateError) {
      return {
        success: false,
        error: sanitizePaymentAccountError(updateError, "Failed to update payment account. Please try again."),
      };
    }
    if (!updated) {
      return {
        success: false,
        error: "This account was changed or archived by someone else. Refresh and try again.",
      };
    }

    revalidatePath("/council/payment-accounts");
    return {
      success: true,
      id: parsed.data.id,
      message: "Payment account updated successfully",
    };
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return {
        success: false,
        error: "Unauthorized: Only Council Executives may manage payment accounts",
      };
    }
    return {
      success: false,
      error: "An unexpected error occurred while updating the payment account. Please try again.",
    };
  }
}

/**
 * Archive a payment account to retire it from new student submissions.
 * Existing submissions retain their destination details and remain valid.
 * Authorized for Council Executives only; Operations and Representatives are forbidden.
 */
export async function archivePaymentAccount(
  input: ArchivePaymentAccountInput
): Promise<PaymentAccountActionResult> {
  try {
    await assertAuthorizedCouncilExecutive();
    const parsed = archivePaymentAccountSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Invalid payment account identifier" };
    }

    const commandClient = createCommandClient();

    const now = new Date().toISOString();
    const { data: archived, error: archiveError } = await commandClient
      .from("payment_accounts")
      .update({
        archived_at: now,
        updated_at: now,
      })
      .eq("id", parsed.data.id)
      .is("archived_at", null)
      .select("id")
      .maybeSingle();

    if (archiveError) {
      return {
        success: false,
        error: sanitizePaymentAccountError(archiveError, "Failed to archive payment account. Please try again."),
      };
    }
    if (!archived) {
      return {
        success: false,
        error: "This payment account was already archived or no longer exists. Please refresh.",
      };
    }

    revalidatePath("/council/payment-accounts");
    return {
      success: true,
      id: parsed.data.id,
      message: "Payment account archived successfully",
    };
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return {
        success: false,
        error: "Unauthorized: Only Council Executives may manage payment accounts",
      };
    }
    return {
      success: false,
      error: "An unexpected error occurred while archiving the payment account. Please try again.",
    };
  }
}

/**
 * Upload an optional payment destination QR code image (PNG/WebP, max 2MB).
 * Registered under purpose 'payment_account_qr' with strict Executive authorization.
 */
export async function uploadPaymentAccountQr(
  formData: FormData
): Promise<{ success: true; fileId: string } | { success: false; error: string }> {
  try {
    await assertAuthorizedCouncilExecutive();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return { success: false, error: "Please select an image file to upload." };
    }
    // uploadFile enforces the empty-file and size limits with user-safe messages.
    const requestKey = randomUUID();
    const fileId = await uploadFile("payment_account_qr", file, requestKey);
    return { success: true, fileId };
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return {
        success: false,
        error: "Unauthorized: Only Council Executives may upload payment destination QR codes",
      };
    }
    if (err instanceof UploadRejectedError) {
      return { success: false, error: err.message };
    }
    return {
      success: false,
      error: "Failed to save QR code to storage. Please try again.",
    };
  }
}

/**
 * Get a short-lived signed URL to preview a payment destination QR code image.
 * Authorized for Council Executives.
 */
export async function getPaymentAccountQrUrl(
  fileId: string
): Promise<{ success: true; url: string } | { success: false; error: string }> {
  try {
    await assertAuthorizedCouncilExecutive();
    const parsedFileId = paymentAccountQrFileIdSchema.safeParse(fileId);
    if (!parsedFileId.success) {
      return { success: false, error: "Invalid QR code file identifier." };
    }

    const url = await getDownloadUrl(parsedFileId.data, "council");
    if (!url) {
      return { success: false, error: "QR code image not found or access expired." };
    }
    return { success: true, url };
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return { success: false, error: "Unauthorized" };
    }
    return {
      success: false,
      error: "Failed to load QR code image. Please try again.",
    };
  }
}

/**
 * Fresh short-lived QR link for an active payment account, fetched when the student's
 * wizard shows it (links signed at page render expire while the page stays open).
 */
export async function getStudentPaymentAccountQrUrl(
  accountId: string
): Promise<{ success: true; url: string } | { success: false; error: string }> {
  try {
    await requireWorkspace("student");
    const parsedId = z.string().uuid().safeParse(accountId);
    if (!parsedId.success) {
      return { success: false, error: "Invalid payment account." };
    }
    const client = await createUserClient();
    const { data: account, error } = await client
      .from("payment_accounts")
      .select("qr_file_id")
      .eq("id", parsedId.data)
      .is("archived_at", null)
      .maybeSingle();
    if (error) throw error;
    const url = account?.qr_file_id
      ? await getDownloadUrl(account.qr_file_id, "student")
      : null;
    if (!url) {
      return { success: false, error: "This account has no QR code available." };
    }
    return { success: true, url };
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "The QR code couldn't load. Please try again." };
  }
}

/**
 * Upload a transfer receipt image (JPEG, PNG, or WebP, max 4 MB) to private R2 storage.
 * Authorized for students only (FL-023 / T-034).
 */
export async function uploadTransferProof(
  formData: FormData
): Promise<{ success: true; fileId: string } | { success: false; error: string }> {
  try {
    await requireWorkspace("student");
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return { success: false, error: "Please select an image file to upload." };
    }
    // Server-generated key: a client key could overwrite already submitted proof.
    const fileId = await uploadFile("payment_proof", file, randomUUID());
    return { success: true, fileId };
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return {
        success: false,
        error: "Unauthorized: Only students may upload transfer payment proof",
      };
    }
    if (err instanceof UploadRejectedError) {
      return { success: false, error: err.message };
    }
    return {
      success: false,
      error: "Failed to save transfer proof to storage. Please try again.",
    };
  }
}

/**
 * Get a short-lived signed URL to preview an uploaded transfer proof image.
 * Authorized for students (their own proof files) and Council Executive/Operations viewers.
 */
export async function getTransferProofUrl(
  fileId: string,
  options?: { isCouncilView?: boolean }
): Promise<{ success: true; url: string } | { success: false; error: string }> {
  try {
    const workspace = options?.isCouncilView ? "council" : "student";
    if (options?.isCouncilView) {
      await assertAuthorizedCouncilManager();
    } else {
      await requireWorkspace("student");
    }

    const parsedFileId = paymentProofFileIdSchema.safeParse(fileId);
    if (!parsedFileId.success) {
      return { success: false, error: "Invalid transfer proof file identifier." };
    }

    const url = await getDownloadUrl(parsedFileId.data, workspace);
    if (!url) {
      return {
        success: false,
        error: "Transfer proof image not found or access expired.",
      };
    }
    return { success: true, url };
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return { success: false, error: "Unauthorized" };
    }
    return {
      success: false,
      error: "Failed to load transfer proof image. Please try again.",
    };
  }
}

/**
 * Submit transfer payment evidence for complete selected obligations within one semester (FL-023 / T-034).
 * Enforces student workspace authorization, same-semester obligation rules, private proof ownership,
 * and active payment account destination snapshots via the submit_transfer_payment RPC.
 */
export async function submitTransferEvidence(
  input: SubmitTransferInput
): Promise<SubmitTransferResult> {
  try {
    const context = await requireWorkspace("student");
    const parsed = submitTransferSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: "Invalid transfer submission input",
        issues: parsed.error.flatten().fieldErrors,
      };
    }

    const userClient = await createUserClient();
    const { data: selectedObligations, error: obligationsError } = await userClient
      .from("obligations")
      .select("id, semester_id, waived_at")
      .eq("student_id", context.profile.id)
      .in("id", parsed.data.obligationIds);

    if (obligationsError) {
      return {
        success: false,
        error: "Unable to verify selected obligations. Please try again.",
      };
    }

    const obligationsList = selectedObligations ?? [];
    if (obligationsList.length !== parsed.data.obligationIds.length) {
      return {
        success: false,
        error: "One or more selected obligations could not be found for your account.",
      };
    }

    if (!hasSameSemesterObligations(obligationsList, parsed.data.semesterId)) {
      return {
        success: false,
        error: "All selected obligations must belong to the same semester.",
      };
    }

    const commandClient = createCommandClient();

    const { data, error } = await commandClient.rpc("submit_transfer_payment", {
      p_key: parsed.data.requestKey,
      p_actor: context.profile.id,
      p_semester: parsed.data.semesterId,
      p_obligations: parsed.data.obligationIds,
      p_payment_account: parsed.data.paymentAccountId,
      p_reference_number: parsed.data.referenceNumber,
      p_proof_file: parsed.data.proofFileId,
    });

    if (error) {
      return {
        success: false,
        error: sanitizeTransferSubmissionError(error),
      };
    }

    const result = data as {
      payment_id: string;
      semester_id: string;
      amount: number;
      status: string;
    } | null;

    if (!result?.payment_id) {
      return {
        success: false,
        error: "Transfer submission returned no result. Please check your payment history before retrying.",
      };
    }

    revalidatePath("/student/fees-and-fines");
    return {
      success: true,
      paymentId: result.payment_id,
      semesterId: result.semester_id,
      amount: Number(result.amount),
      message: "Transfer evidence submitted for Council verification.",
    };
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return {
        success: false,
        error: "Unauthorized: Only students may submit transfer payment evidence",
      };
    }
    return { success: false, error: sanitizeTransferSubmissionError(null) };
  }
}

/**
 * Record an in-person cash payment against complete selected obligations within one semester (FL-024 / T-035).
 * Enforces Council Executive/Operations authority, self-recording prohibition, same-semester obligation rules,
 * and atomic settlement via the record_cash_payment RPC.
 */
export async function recordCashPayment(
  input: RecordCashPaymentInput
): Promise<RecordCashPaymentResult> {
  try {
    const context = await assertAuthorizedCouncilManager();
    const parsed = recordCashPaymentSchema.safeParse(input);
    if (!parsed.success) {
      const issues = parsed.error.flatten().fieldErrors;
      return {
        success: false,
        error: Object.values(issues).flat()[0] ?? "Invalid cash payment input",
        issues,
      };
    }

    if (!canRecordCashForStudent(context.profile.id, parsed.data.studentId)) {
      return {
        success: false,
        error: "Officers are not permitted to record their own cash payments.",
      };
    }

    // record_cash_payment locks the obligations and checks owner, semester, waiver and settlement itself.
    const commandClient = createCommandClient();

    const { data, error } = await commandClient.rpc("record_cash_payment", {
      p_key: parsed.data.requestKey,
      p_actor: context.profile.id,
      p_student: parsed.data.studentId,
      p_semester: parsed.data.semesterId,
      p_obligations: parsed.data.obligationIds,
      p_received_at: parsed.data.receivedAt,
    });

    if (error) {
      return {
        success: false,
        error: sanitizeCashPaymentError(error),
      };
    }

    const result = data as {
      payment_id: string;
      receipt_id: string;
      amount: number;
    } | null;

    if (!result?.payment_id || !result?.receipt_id) {
      return {
        success: false,
        error: "Cash payment recording returned no result. Check the payment history before retrying.",
      };
    }

    revalidatePath("/council/payments");
    revalidatePath("/council/clearance");
    revalidatePath("/student/fees-and-fines");
    return {
      success: true,
      paymentId: result.payment_id,
      receiptId: result.receipt_id,
      semesterId: parsed.data.semesterId,
      amount: Number(result.amount),
      message: "Cash payment recorded and verified.",
    };
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return {
        success: false,
        error: "Unauthorized: Only Council Executives and Operations may record cash payments",
      };
    }
    return { success: false, error: sanitizeCashPaymentError(null) };
  }
}

/**
 * Verify or reject a pending transfer submission (FL-025 / T-036).
 * Enforces Council Executive/Operations authority and the self-decision prohibition, then decides
 * atomically through the verify_payment RPC, which also locks the payment, creates or links the
 * receipt, records any external return, and notifies the student in the same transaction.
 * The actor always comes from the session; the browser never supplies it.
 */
export async function decideTransfer(
  input: TransferDecisionInput
): Promise<TransferDecisionResult> {
  try {
    const context = await assertAuthorizedCouncilManager();
    const parsed = transferDecisionSchema.safeParse(input);
    if (!parsed.success) {
      const issues = parsed.error.flatten().fieldErrors as Record<string, string[]>;
      return {
        success: false,
        error: Object.values(issues).flat()[0] ?? "Invalid transfer decision input",
        issues,
      };
    }
    const d = parsed.data;

    // Read the payment's owner (RLS-scoped, explicit field) for an early self-decision refusal.
    const userClient = await createUserClient();
    const { data: payment, error: paymentError } = await userClient
      .from("payments")
      .select("student_id")
      .eq("id", d.paymentId)
      .maybeSingle();
    if (paymentError || !payment) {
      return { success: false, error: "This transfer could not be found. Refresh the page and try again." };
    }
    if (!canDecideTransferForStudent(context.profile.id, payment.student_id)) {
      return {
        success: false,
        error: "Officers are not permitted to decide their own transfer submissions.",
      };
    }

    // Generated RPC args are non-null; verify_payment takes SQL NULL for fields a mode does not use.
    const nullable = (value: string | undefined) => (value ?? null) as string;
    const { data, error } = await createCommandClient().rpc("verify_payment", {
      p_key: d.requestKey,
      p_actor: context.profile.id,
      p_payment: d.paymentId,
      p_mode: d.mode,
      p_reason: nullable("reason" in d ? d.reason : undefined),
      p_received_at: nullable("receivedAt" in d ? d.receivedAt : undefined),
      p_existing_receipt: nullable("existingReceiptId" in d ? d.existingReceiptId : undefined),
      p_refunded_at: nullable("refundedAt" in d ? d.refundedAt : undefined),
      p_facts_confirmed: d.factsConfirmed,
    });

    if (error) {
      // Only a database error proves the command and its request key were rolled back; otherwise replay the same key.
      if (!commandRolledBack(error)) return { success: false, error: UNCONFIRMED_COMMAND_MESSAGE };
      return { success: false, error: sanitizeTransferDecisionError(error), retryWithNewKey: true };
    }

    const result = data as {
      payment_id: string;
      status: "verified" | "rejected";
      receipt_id: string | null;
    } | null;
    if (!result?.payment_id || !result.status) {
      return {
        success: false,
        error: "The decision returned no result. Refresh the page to check the transfer's status before retrying.",
      };
    }

    revalidatePath("/council/payments");
    revalidatePath("/council/clearance");
    revalidatePath("/student/fees-and-fines");
    revalidatePath("/student/notifications");
    return {
      success: true,
      paymentId: result.payment_id,
      status: result.status,
      receiptId: result.receipt_id ?? null,
      message:
        result.status === "verified"
          ? "Transfer verified and the student was notified."
          : "Transfer rejected and the student was notified.",
    };
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return {
        success: false,
        error: "Unauthorized: Only Council Executives and Operations may verify or reject transfers",
      };
    }
    return { success: false, error: sanitizeTransferDecisionError(null) };
  }
}

/**
 * Waive an unpaid fee or fine obligation with attributable reason (FL-026 / T-037).
 * Covers unpaid obligation waivers and cancellations; changes what is owed, never money already received.
 * Enforces Council Executive/Operations authority and the self-waiver prohibition in both the server action
 * and the atomic waive_obligation RPC under row-level obligation lock.
 */
export async function waiveObligation(
  input: WaiveObligationInput
): Promise<WaiveObligationResult> {
  try {
    const context = await assertAuthorizedCouncilManager();
    const parsed = waiveObligationSchema.safeParse(input);
    if (!parsed.success) {
      const issues = parsed.error.flatten().fieldErrors as Record<string, string[]>;
      return {
        success: false,
        error: Object.values(issues).flat()[0] ?? "Invalid obligation waiver input",
        issues,
      };
    }

    // waive_obligation locks the obligation row and re-verifies self-waiver, unpaid standing and no pending transfer, then notifies the student.
    const { data, error } = await createCommandClient().rpc("waive_obligation", {
      p_key: parsed.data.requestKey,
      p_actor: context.profile.id,
      p_obligation: parsed.data.obligationId,
      p_reason: parsed.data.reason,
    });

    if (error) {
      if (!commandRolledBack(error)) return { success: false, error: UNCONFIRMED_COMMAND_MESSAGE };
      return {
        success: false,
        error: sanitizeWaiveObligationError(error),
        retryWithNewKey: true,
      };
    }

    const result = data as {
      obligation_id: string;
      waived_at: string;
    } | null;

    if (!result?.obligation_id || !result.waived_at) {
      return {
        success: false,
        error: "The waiver returned no result. Refresh the page to check the obligation's status before retrying.",
      };
    }

    revalidatePath("/council/payments");
    revalidatePath("/council/clearance");
    revalidatePath("/student/fees-and-fines");
    revalidatePath("/student/notifications");
    return {
      success: true,
      obligationId: result.obligation_id,
      waivedAt: result.waived_at,
      message: "Obligation waived.",
    };
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return {
        success: false,
        error: "Unauthorized: Only Council Executives and Operations may waive unpaid obligations",
      };
    }
    return { success: false, error: sanitizeWaiveObligationError(null) };
  }
}

/**
 * Record a completed full-payment refund that actually occurred outside the platform (FL-027 / T-038).
 * Preserves gross received, refunds, and net totals without overwriting payment status or waiving debt;
 * active obligations covered by the refunded receipt become payable again and the student is notified.
 * Enforces Council Executive/Operations authority and self-refund prohibition in both the server action
 * and the atomic record_refund RPC under receipt/payment/obligation locks.
 */
export async function recordRefund(
  input: RecordRefundInput
): Promise<RecordRefundResult> {
  try {
    const context = await assertAuthorizedCouncilManager();
    const parsed = recordRefundSchema.safeParse(input);
    if (!parsed.success) {
      const issues = parsed.error.flatten().fieldErrors as Record<string, string[]>;
      return {
        success: false,
        error: Object.values(issues).flat()[0] ?? "Invalid refund input",
        issues,
      };
    }
    const d = parsed.data;

    // Early RLS-scoped owner check so self-refund is refused before invoking the command client.
    const userClient = await createUserClient();
    const { data: payment, error: paymentError } = await userClient
      .from("payments")
      .select("student_id")
      .eq("receipt_id", d.receiptId)
      .eq("is_receipt_record", true)
      .eq("record_status", "current")
      .maybeSingle();

    if (paymentError || !payment) {
      return {
        success: false,
        error: "This payment receipt could not be found. Refresh the page and try again.",
      };
    }

    if (!canRecordRefundForStudent(context.profile.id, payment.student_id)) {
      return {
        success: false,
        error: "Officers are not permitted to record refunds for their own payments.",
      };
    }

    // record_refund locks request -> receipt -> payment -> sorted obligations, inserts payment_refunds, and notifies the student.
    const { data, error } = await createCommandClient().rpc("record_refund", {
      p_key: d.requestKey,
      p_actor: context.profile.id,
      p_receipt: d.receiptId,
      p_refunded_at: d.refundedAt,
      p_reason: d.reason,
      p_facts_confirmed: d.factsConfirmed,
    });

    if (error) {
      if (!commandRolledBack(error)) return { success: false, error: UNCONFIRMED_COMMAND_MESSAGE };
      return {
        success: false,
        error: sanitizeRecordRefundError(error),
        retryWithNewKey: true,
      };
    }

    const result = data as {
      refund_id: string;
      receipt_id: string;
      amount: number | string;
    } | null;

    const amount = result ? Number(result.amount) : NaN;
    if (!result?.refund_id || !result.receipt_id || !Number.isFinite(amount)) {
      return {
        success: false,
        error: "The refund returned no result. Refresh the page to check the payment's status before retrying.",
      };
    }

    revalidatePath("/council/payments");
    revalidatePath("/council/clearance");
    revalidatePath("/student/fees-and-fines");
    revalidatePath("/student/notifications");
    return {
      success: true,
      refundId: result.refund_id,
      receiptId: result.receipt_id,
      amount,
      message: "Refund recorded and the student was notified.",
    };
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return {
        success: false,
        error: "Unauthorized: Only Council Executives and Operations may record payment refunds",
      };
    }
    return { success: false, error: sanitizeRecordRefundError(null) };
  }
}

/**
 * Load same-student, same-semester obligation options for the payment correction dialog (FL-028 / T-039).
 * Authorized for Council Executive and Operations only (excluding the payment's own student).
 */
export async function getPaymentCorrectionOptions(
  paymentId: string
): Promise<
  | { success: true; obligations: ObligationWithStandingDTO[] }
  | { success: false; error: string }
> {
  try {
    const parsed = correctPaymentSchema.shape.paymentId.safeParse(paymentId);
    if (!parsed.success) {
      return { success: false, error: "Invalid payment identifier" };
    }
    const obligations = await getCouncilPaymentCorrectionOptions(parsed.data);
    return { success: true, obligations };
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return {
        success: false,
        error: "Unauthorized: Only Council Executives and Operations may correct payment records",
      };
    }
    // Only getCouncilPaymentCorrectionOptions' own messages reach the browser.
    const message = err instanceof Error ? err.message : "";
    return {
      success: false,
      error: CORRECTION_OPTION_MESSAGES.has(message)
        ? message
        : "Unable to load obligations for correction.",
    };
  }
}

const CORRECTION_OPTION_MESSAGES = new Set([
  "This payment record could not be found. Refresh the page and try again.",
  "Officers are not permitted to correct their own payments.",
  "Unable to load correction options.",
  "Unable to load payment refunds.",
  "This payment record can no longer be corrected. Refresh the page to see its latest status.",
]);

/**
 * Correct an erroneous received payment by inserting a linked replacement and marking the
 * previous record Superseded (FL-028 / T-039). Preserves receipt and refund identity without
 * moving or returning money. Enforces Executive/Operations authority and self-correction
 * prohibition in both the server action and the atomic correct_payment RPC under locks.
 */
export async function correctPayment(
  input: CorrectPaymentInput
): Promise<CorrectPaymentResult> {
  try {
    const context = await assertAuthorizedCouncilManager();
    const parsed = correctPaymentSchema.safeParse(input);
    if (!parsed.success) {
      const issues = parsed.error.flatten().fieldErrors as Record<string, string[]>;
      return {
        success: false,
        error: Object.values(issues).flat()[0] ?? "Invalid payment correction input",
        issues,
      };
    }
    const d = parsed.data;

    // Early RLS-scoped self-correction check. Record state is left to correct_payment, so an
    // unchanged retry of a committed correction replays its stored result instead of failing here.
    const userClient = await createUserClient();
    const { data: payment, error: paymentError } = await userClient
      .from("payments")
      .select("student_id")
      .eq("id", d.paymentId)
      .maybeSingle();

    if (paymentError || !payment) {
      return {
        success: false,
        error: "This payment record could not be found. Refresh the page and try again.",
      };
    }

    if (!canCorrectPaymentForStudent(context.profile.id, payment.student_id)) {
      return {
        success: false,
        error: "Officers are not permitted to correct their own payments.",
      };
    }

    // correct_payment locks request -> receipt -> payment -> sorted union of old/new obligations,
    // supersedes the target, and inserts the linked replacement under the same receipt_id.
    const { data, error } = await createCommandClient().rpc("correct_payment", {
      p_key: d.requestKey,
      p_actor: context.profile.id,
      p_payment: d.paymentId,
      p_obligations: d.obligationIds,
      p_reason: d.reason,
    });

    if (error) {
      if (!commandRolledBack(error)) {
        return { success: false, error: UNCONFIRMED_COMMAND_MESSAGE };
      }
      return {
        success: false,
        error: sanitizeCorrectPaymentError(error),
        retryWithNewKey: true,
      };
    }

    const result = data as {
      payment_id: string;
      supersedes_payment_id: string;
      receipt_id: string;
      amount: number | string;
    } | null;

    const amount = result ? Number(result.amount) : NaN;
    if (
      !result?.payment_id ||
      !result.supersedes_payment_id ||
      !result.receipt_id ||
      !Number.isFinite(amount)
    ) {
      return {
        success: false,
        error: "The correction returned no result. Refresh the page to check the payment's status before retrying.",
      };
    }

    revalidatePath("/council/payments");
    revalidatePath("/council/clearance");
    revalidatePath("/student/fees-and-fines");
    return {
      success: true,
      paymentId: result.payment_id,
      supersedesPaymentId: result.supersedes_payment_id,
      receiptId: result.receipt_id,
      amount,
      message: "Payment corrected. The previous record was marked Superseded.",
    };
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return {
        success: false,
        error: "Unauthorized: Only Council Executives and Operations may correct payment records",
      };
    }
    return { success: false, error: sanitizeCorrectPaymentError(null) };
  }
}

