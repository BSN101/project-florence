"use server";

import { revalidatePath } from "next/cache";

import { AccessDeniedError, requireWorkspace } from "@/server/auth/require-workspace";
import { createCommandClient } from "@/server/db/command-client";

import type { DefinitionActionResult } from "./contracts";
import {
  archiveFeeDefinitionSchema,
  archiveFineDefinitionSchema,
  createFeeDefinitionSchema,
  createFineDefinitionSchema,
  updateFeeDefinitionSchema,
  updateFineDefinitionSchema,
  type ArchiveFeeDefinitionInput,
  type ArchiveFineDefinitionInput,
  type CreateFeeDefinitionInput,
  type CreateFineDefinitionInput,
  type UpdateFeeDefinitionInput,
  type UpdateFineDefinitionInput,
} from "./schemas";

/**
 * Enforce that the caller is an authenticated Council member with Executive or Operations authority.
 * Council Representatives, Students, and Faculty are strictly forbidden.
 */
async function assertAuthorizedCouncilManager() {
  const context = await requireWorkspace("council");
  if (context.councilRole !== "executive" && context.councilRole !== "operations") {
    throw new AccessDeniedError("forbidden");
  }
  return context;
}

/**
 * Create a new reusable fine definition for event consequences.
 * Authorized for Council Executive and Operations only.
 */
export async function createFineDefinition(
  input: CreateFineDefinitionInput
): Promise<DefinitionActionResult> {
  try {
    const context = await assertAuthorizedCouncilManager();
    const parsed = createFineDefinitionSchema.safeParse(input);
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
  input: UpdateFineDefinitionInput
): Promise<DefinitionActionResult> {
  try {
    await assertAuthorizedCouncilManager();
    const parsed = updateFineDefinitionSchema.safeParse(input);
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
  input: ArchiveFineDefinitionInput
): Promise<DefinitionActionResult> {
  try {
    await assertAuthorizedCouncilManager();
    const parsed = archiveFineDefinitionSchema.safeParse(input);
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
  input: CreateFeeDefinitionInput
): Promise<DefinitionActionResult> {
  try {
    const context = await assertAuthorizedCouncilManager();
    const parsed = createFeeDefinitionSchema.safeParse(input);
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
  input: UpdateFeeDefinitionInput
): Promise<DefinitionActionResult> {
  try {
    await assertAuthorizedCouncilManager();
    const parsed = updateFeeDefinitionSchema.safeParse(input);
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
  input: ArchiveFeeDefinitionInput
): Promise<DefinitionActionResult> {
  try {
    await assertAuthorizedCouncilManager();
    const parsed = archiveFeeDefinitionSchema.safeParse(input);
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
