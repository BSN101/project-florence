import "server-only";

import { createUserClient } from "@/server/db/user-client";
import type { FineDefinitionDTO } from "./contracts";

/**
 * Fetch active fine definitions for display and future event consequence configuration.
 * Automatically filtered by database RLS so only authorized Council users receive records.
 */
export async function getActiveFineDefinitions(): Promise<FineDefinitionDTO[]> {
  const client = await createUserClient();
  const { data, error } = await client
    .from("fine_definitions")
    .select("id, name, amount, archived_at, created_at, updated_at")
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
}): Promise<FineDefinitionDTO[]> {
  const client = await createUserClient();
  let query = client
    .from("fine_definitions")
    .select("id, name, amount, archived_at, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (!options?.includeArchived) {
    query = query.is("archived_at", null);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to fetch fine definitions: ${error.message}`);
  }

  return data ?? [];
}

