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
