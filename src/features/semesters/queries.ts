import "server-only";

import { createUserClient } from "@/server/db/user-client";
import type { SemesterListItem } from "./contracts";

/**
 * Retrieve all semesters for Council workspace users, ordered with current/recent first.
 * Uses request-scoped user client under RLS.
 */
export async function getSemesters(): Promise<SemesterListItem[]> {
  const client = await createUserClient();
  const { data, error } = await client
    .from("semesters")
    .select("id, academic_year_start, term, starts_on, ends_on, is_current, created_at")
    .order("academic_year_start", { ascending: false })
    .order("starts_on", { ascending: false });

  if (error) {
    throw new Error(`Failed to load semesters: ${error.message}`);
  }

  return data ?? [];
}
