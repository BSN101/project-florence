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

/**
 * Standardized action result contract for fine definition mutations.
 */
export type FineDefinitionCatalogItem = FineDefinitionDTO & { creator_name: string };

export type FineActionResult =
  | { success: true; id: string; message?: string }
  | { success: false; error: string; issues?: Record<string, string[]> };

