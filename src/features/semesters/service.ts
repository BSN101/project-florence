import "server-only";

import { readFileSync } from "node:fs";
import { revalidatePath } from "next/cache";
import postgres from "postgres";
import { getAccessContext } from "@/server/auth/access-context";
import { createCommandClient } from "@/server/db/command-client";
import type { SemesterActionResult } from "./contracts";
import { activateSemesterInTransaction, isMatchingSemesterDatabase } from "./activation";
import {
  activateSemesterSchema,
  createSemesterSchema,
} from "./schemas";

export class SemesterServiceError extends Error {
  constructor(message: string, public readonly code: string = "BAD_REQUEST") {
    super(message);
    this.name = "SemesterServiceError";
  }
}

/**
 * Authorize Council Executive or Council Operations actor.
 * Representatives and non-council users are strictly denied.
 */
export async function requireSemesterManager() {
  const context = await getAccessContext();
  if (context.status !== "ready") {
    throw new SemesterServiceError("Authentication required", "UNAUTHENTICATED");
  }
  if (context.councilRole !== "executive" && context.councilRole !== "operations") {
    throw new SemesterServiceError(
      "Only Council Executive or Operations members may manage semesters",
      "FORBIDDEN",
    );
  }
  return context;
}

/**
 * Create a new semester in the database.
 * Invariant: Creating a semester MUST NOT automatically activate it (is_current remains false).
 * Invariant: It MUST NOT alter record attribution of existing academic/financial/disciplinary records.
 */
export async function createSemester(rawInput: unknown): Promise<SemesterActionResult> {
  const actor = await requireSemesterManager();
  const parsed = createSemesterSchema.safeParse(rawInput);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues.map((i) => i.message).join(", ");
    return { success: false, error: errorMsg };
  }

  const input = parsed.data;
  const commandClient = createCommandClient();

  // Check unique constraint (academic_year_start, term) before attempting insert
  const { data: existing } = await commandClient
    .from("semesters")
    .select("id")
    .eq("academic_year_start", input.academic_year_start)
    .eq("term", input.term)
    .maybeSingle();

  if (existing) {
    const ay = `AY ${input.academic_year_start}–${input.academic_year_start + 1}`;
    return {
      success: false,
      error: `A semester for ${ay} ${input.term} already exists.`,
    };
  }

  // Inserting new semester with is_current: false
  const { data: created, error } = await commandClient
    .from("semesters")
    .insert({
      academic_year_start: input.academic_year_start,
      term: input.term,
      starts_on: input.starts_on,
      ends_on: input.ends_on,
      is_current: false,
      created_by: actor.profile.id,
    })
    .select("id, academic_year_start, term, starts_on, ends_on, is_current, created_at")
    .single();

  if (error || !created) {
    if (error?.code === "23505") {
      const ay = `AY ${input.academic_year_start}–${input.academic_year_start + 1}`;
      return {
        success: false,
        error: `A semester for ${ay} ${input.term} already exists.`,
      };
    }
    return { success: false, error: error?.message ?? "Failed to create semester" };
  }

  revalidatePath("/council/semesters");
  revalidatePath("/council");
  return {
    success: true,
    message: `Created ${input.term} (AY ${input.academic_year_start}–${input.academic_year_start + 1}) successfully.`,
    semester: created,
  };
}

/**
 * Explicitly activate a semester as the current academic context.
 * Invariant: Atomic operation acquiring semester-context lock, setting previous current to false,
 * and setting target row to is_current = true.
 * Invariant: No standalone deactivate action exists; prior semester becomes inactive when new one is made current.
 */
export async function activateSemester(rawInput: unknown): Promise<SemesterActionResult> {
  await requireSemesterManager();
  const parsed = activateSemesterSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: "Invalid semester ID provided." };
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return { success: false, error: "Semester activation is unavailable: DATABASE_URL is not configured." };
  }
  if (!isMatchingSemesterDatabase(dbUrl, process.env.NEXT_PUBLIC_SUPABASE_URL)) {
    return { success: false, error: "DATABASE_URL must point to the same Supabase project as the application." };
  }

  let result: SemesterActionResult;
  try {
    const caPath = process.env.NODE_EXTRA_CA_CERTS;
    const ca = process.env.DATABASE_CA_CERT || (caPath ? readFileSync(caPath, "utf8") : undefined);
    const sql = postgres(dbUrl, {
      max: 1,
      prepare: false,
      ssl: {
        rejectUnauthorized: true,
        ...(ca ? { ca } : {}),
      },
      connect_timeout: 15,
      connection: { statement_timeout: 30_000, lock_timeout: 10_000 },
    });
    try {
      result = await sql.begin((tx) => activateSemesterInTransaction(tx, parsed.data));
    } finally {
      await sql.end();
    }
  } catch {
    return { success: false, error: "Activation could not be confirmed. Refresh the page to check the current semester before retrying." };
  }
  if (!result.success) return result;
  revalidatePath("/council/semesters");
  revalidatePath("/council");
  revalidatePath("/student");
  revalidatePath("/faculty");
  return result;
}
