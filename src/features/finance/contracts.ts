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
  | "instructions"
  | "qr_file_id"
  | "archived_at"
>;

export type PaymentAccountCatalogItem = PaymentAccountDTO;

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
