import "server-only";

import { AccessDeniedError, requireWorkspace } from "@/server/auth/require-workspace";
import { createUserClient } from "@/server/db/user-client";
import {
  type FeeDefinitionCatalogItem,
  type FeeDefinitionDTO,
  type FeePublicationDTO,
  type FeePublicationPreview,
  type FineDefinitionCatalogItem,
  type FineDefinitionDTO,
  type PaymentAccountDTO,
  isAuthorizedPaymentAccountManager,
} from "./contracts";
import { previewFeeObligationsSchema, type PreviewFeeObligationsInput } from "./schemas";

/**
 * Enforce that the caller is an authenticated Council member with Executive or Operations authority.
 * Council Representatives, Students, and Faculty are strictly forbidden.
 */
export async function assertAuthorizedCouncilManager() {
  const context = await requireWorkspace("council");
  if (context.councilRole !== "executive" && context.councilRole !== "operations") {
    throw new AccessDeniedError("forbidden");
  }
  return context;
}

/**
 * Enforce that the caller is an authenticated Council Executive (FL-047 / T-032).
 * Council Operations, Representatives, Students, and Faculty are strictly forbidden.
 * Operations may read historical snapshots through payments, but cannot manage payment accounts.
 */
export async function assertAuthorizedCouncilExecutive() {
  const context = await requireWorkspace("council");
  if (!isAuthorizedPaymentAccountManager(context.councilRole)) {
    throw new AccessDeniedError("forbidden");
  }
  return context;
}

/**
 * Fetch active fee definitions for future fee publication (T-031).
 * Automatically filtered by database RLS so only authorized Council users receive records.
 */
export async function getActiveFeeDefinitions(): Promise<FeeDefinitionDTO[]> {
  const client = await createUserClient();
  const { data, error } = await client
    .from("fee_definitions")
    .select("id, name, amount, archived_at, created_by, created_at, updated_at")
    .is("archived_at", null)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch active fee definitions: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Fetch fee definitions with creator names for the Council catalog dashboard.
 * Archived definitions are included only when requested.
 */
export async function getFeeDefinitions(options?: {
  includeArchived?: boolean;
}): Promise<FeeDefinitionCatalogItem[]> {
  const client = await createUserClient();
  const { data, error } = await client.rpc("florence_fee_definitions");
  if (error) {
    throw new Error(`Failed to fetch fee definitions: ${error.message}`);
  }

  // Generated RPC types mark archived_at as non-null; the column is nullable.
  const definitions = (data ?? []) as unknown as FeeDefinitionCatalogItem[];
  return options?.includeArchived ? definitions : definitions.filter((fee) => fee.archived_at === null);
}

/**
 * Fetch active fine definitions for display and future event consequence configuration.
 * Automatically filtered by database RLS so only authorized Council users receive records.
 */
export async function getActiveFineDefinitions(): Promise<FineDefinitionDTO[]> {
  const client = await createUserClient();
  const { data, error } = await client
    .from("fine_definitions")
    .select("id, name, amount, archived_at, created_by, created_at, updated_at")
    .is("archived_at", null)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch active fine definitions: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Fetch fine definitions with optional archival filtering for the Council catalog dashboard.
 */
export async function getFineDefinitions(options?: {
  includeArchived?: boolean;
}): Promise<FineDefinitionCatalogItem[]> {
  const client = await createUserClient();
  // Regenerate database.types.ts after the catalog migration is applied.
  const { data, error } = await client.rpc("florence_fine_definitions" as never);
  if (error) {
    throw new Error(`Failed to fetch fine definitions: ${error.message}`);
  }

  const definitions = (data ?? []) as FineDefinitionCatalogItem[];
  return options?.includeArchived ? definitions : definitions.filter((fine) => fine.archived_at === null);
}

/** Reads every page so the API row cap cannot silently truncate preview counts. */
async function allStudentIds(
  page: (
    from: number,
    to: number
  ) => PromiseLike<{ data: { student_id: string }[] | null; error: { message: string } | null }>
): Promise<string[]> {
  const ids: string[] = [];
  for (let from = 0; ; ) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(`Failed to load fee audience: ${error.message}`);
    if (!data?.length) return ids;
    ids.push(...data.map((row) => row.student_id));
    from += data.length;
  }
}

/**
 * Preview audience size, existing obligations, and projected totals before publishing fee obligations.
 * Restricted to Council Executive and Operations.
 */
export async function previewFeeObligations(
  input: PreviewFeeObligationsInput
): Promise<FeePublicationPreview> {
  await assertAuthorizedCouncilManager();
  const parsed = previewFeeObligationsSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("Invalid audience preview input");
  }

  const client = await createUserClient();

  const { data: feeDef, error: feeError } = await client
    .from("fee_definitions")
    .select("id, name, amount, archived_at")
    .eq("id", parsed.data.feeDefinitionId)
    .is("archived_at", null)
    .maybeSingle();

  if (feeError || !feeDef) {
    throw new Error("Active fee definition required");
  }

  const { semesterId, feeDefinitionId, yearLevels, academicStatuses } = parsed.data;
  const matchingStudentIds = await allStudentIds((from, to) =>
    client
      .from("enrollments")
      .select("student_id")
      .eq("semester_id", semesterId)
      .in("year_level", yearLevels)
      .in("academic_status", academicStatuses)
      .order("student_id")
      .range(from, to)
  );
  if (matchingStudentIds.length === 0) {
    return {
      totalMatchingStudents: 0,
      alreadyObligatedCount: 0,
      newObligationsCount: 0,
      unitAmount: Number(feeDef.amount),
      totalNewAmount: 0,
    };
  }

  // Filter by fee and semester only; listing every student ID in the URL breaks on large audiences.
  const chargedStudentIds = new Set(
    await allStudentIds((from, to) =>
      client
        .from("obligations")
        .select("student_id")
        .eq("kind", "fee")
        .eq("fee_definition_id", feeDefinitionId)
        .eq("semester_id", semesterId)
        .order("student_id")
        .range(from, to)
    )
  );
  const alreadyObligatedCount = matchingStudentIds.filter((id) => chargedStudentIds.has(id)).length;
  const totalMatchingStudents = matchingStudentIds.length;
  const newObligationsCount = Math.max(0, totalMatchingStudents - alreadyObligatedCount);
  const unitAmount = Number(feeDef.amount);
  const totalNewAmount = Number((newObligationsCount * unitAmount).toFixed(2));

  return {
    totalMatchingStudents,
    alreadyObligatedCount,
    newObligationsCount,
    unitAmount,
    totalNewAmount,
  };
}

/**
 * Fetch historical fee publications for audit and display.
 * Restricted to Council Executive and Operations.
 */
export async function getFeePublications(
  semesterId?: string
): Promise<FeePublicationDTO[]> {
  await assertAuthorizedCouncilManager();
  const client = await createUserClient();

  let query = client
    .from("fee_publications")
    .select(
      "id, fee_definition_id, semester_id, year_levels, academic_statuses, description, amount, published_by, published_at"
    )
    .order("published_at", { ascending: false });

  if (semesterId) {
    query = query.eq("semester_id", semesterId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to fetch fee publications: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Fetch payment accounts for Council Executive administration (FL-047 / T-032).
 * Strictly restricted to Council Executives.
 * Uses the request-scoped user client and explicit permitted projection.
 */
export async function getPaymentAccounts(options?: {
  includeArchived?: boolean;
}): Promise<PaymentAccountDTO[]> {
  await assertAuthorizedCouncilExecutive();
  const client = await createUserClient();

  let query = client
    .from("payment_accounts")
    .select("id, label, account_name, account_reference, instructions, qr_file_id, archived_at")
    .order("label", { ascending: true });

  if (!options?.includeArchived) {
    query = query.is("archived_at", null);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to fetch payment accounts: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Fetch active payment accounts for student transfer submission.
 * Enforces database RLS: students see active destinations only (archived_at is null).
 */
export async function getActivePaymentAccounts(): Promise<PaymentAccountDTO[]> {
  const client = await createUserClient();
  const { data, error } = await client
    .from("payment_accounts")
    .select("id, label, account_name, account_reference, instructions, qr_file_id, archived_at")
    .is("archived_at", null)
    .order("label", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch active payment accounts: ${error.message}`);
  }

  return data ?? [];
}

