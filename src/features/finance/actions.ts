"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { AccessDeniedError } from "@/server/auth/require-workspace";
import { createCommandClient } from "@/server/db/command-client";
import { getDownloadUrl, uploadFile, UploadRejectedError } from "@/server/storage/files";

import {
  type DefinitionActionResult,
  type FeePublicationPreview,
  type PaymentAccountActionResult,
  type PublishFeeResult,
  sanitizePaymentAccountError,
} from "./contracts";
import {
  assertAuthorizedCouncilExecutive,
  assertAuthorizedCouncilManager,
  previewFeeObligations,
} from "./queries";
import {
  archiveDefinitionSchema,
  archivePaymentAccountSchema,
  createDefinitionSchema,
  createPaymentAccountSchema,
  PAYMENT_ACCOUNT_QR_MAX_BYTES,
  paymentAccountQrFileIdSchema,
  publishFeeObligationsSchema,
  updateDefinitionSchema,
  updatePaymentAccountSchema,
  type ArchiveDefinitionInput,
  type ArchivePaymentAccountInput,
  type CreateDefinitionInput,
  type CreatePaymentAccountInput,
  type PreviewFeeObligationsInput,
  type PublishFeeObligationsInput,
  type UpdateDefinitionInput,
  type UpdatePaymentAccountInput,
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
        instructions: parsed.data.instructions ?? null,
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

    const commandClient = createCommandClient();

    const { data: updated, error: updateError } = await commandClient
      .from("payment_accounts")
      .update({
        label: parsed.data.label,
        account_name: parsed.data.accountName,
        account_reference: parsed.data.accountReference,
        instructions: parsed.data.instructions ?? null,
        qr_file_id: parsed.data.qrFileId ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", parsed.data.id)
      .is("archived_at", null)
      .select("id")
      .maybeSingle();

    if (updateError) {
      return {
        success: false,
        error: sanitizePaymentAccountError(updateError, "Failed to update payment account. Please try again."),
      };
    }
    if (!updated) {
      return {
        success: false,
        error: "This payment account is archived or no longer exists. Please refresh.",
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
    if (file.size === 0) {
      return { success: false, error: "The selected file is empty." };
    }
    if (file.size > PAYMENT_ACCOUNT_QR_MAX_BYTES) {
      return { success: false, error: "The QR code file must be smaller than 2 MB." };
    }

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
      error: "Failed to upload QR code. Please try again with a valid PNG, JPEG, or WebP image.",
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
