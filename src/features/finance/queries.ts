import "server-only";

import { createUserClient } from "@/server/db/user-client";
import type {
  FeeDefinitionCatalogItem,
  FeeDefinitionDTO,
  FineDefinitionCatalogItem,
  FineDefinitionDTO,
} from "./contracts";

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

