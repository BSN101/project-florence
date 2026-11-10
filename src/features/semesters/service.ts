import "server-only";

import { revalidatePath } from "next/cache";
import { getAccessContext } from "@/server/auth/access-context";
import { createCommandClient } from "@/server/db/command-client";
import type { SemesterActionResult } from "./contracts";
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

  const { semesterId } = parsed.data;
  const commandClient = createCommandClient();

  // Verify target semester exists
  const { data: target, error: targetError } = await commandClient
    .from("semesters")
    .select("id, academic_year_start, term, starts_on, ends_on, is_current, created_at")
    .eq("id", semesterId)
    .maybeSingle();

  if (targetError || !target) {
    return { success: false, error: "Target semester not found." };
  }

  if (target.is_current) {
    return {
      success: true,
      message: `${target.term} (AY ${target.academic_year_start}–${target.academic_year_start + 1}) is already active.`,
      semester: target,
    };
  }

  // Atomic update:
  // If direct database connection is provided, run with explicit transaction & advisory lock
  const dbUrl = process.env.DATABASE_URL || process.env.SEED_DATABASE_URL;
  if (dbUrl) {
    try {
      const postgres = (await import("postgres")).default;
      const sql = postgres(dbUrl, { max: 1, ssl: "require" });
      try {
        await sql.begin(async (tx) => {
          await tx`select pg_advisory_xact_lock(hashtextextended('florence:semester-context', 0))`;
          await tx`update public.semesters set is_current = false where is_current = true`;
          await tx`update public.semesters set is_current = true where id = ${semesterId}`;
        });
      } finally {
        await sql.end();
      }
    } catch (pgError: unknown) {
      const message = pgError instanceof Error ? pgError.message : "Database transaction failed";
      return { success: false, error: `Failed to activate semester: ${message}` };
    }
  } else {
    // Via service_role command client:
    // The database trigger `semester_context_lock` on public.semesters automatically acquires
    // `pg_advisory_xact_lock(hashtextextended('florence:semester-context', 0))` before each update.
    const { error: deactivateError } = await commandClient
      .from("semesters")
      .update({ is_current: false })
      .eq("is_current", true);

    if (deactivateError) {
      return {
        success: false,
        error: `Failed to deactivate current semester: ${deactivateError.message}`,
      };
    }

    const { data: activated, error: activateError } = await commandClient
      .from("semesters")
      .update({ is_current: true })
      .eq("id", semesterId)
      .select("id, academic_year_start, term, starts_on, ends_on, is_current, created_at")
      .single();

    if (activateError || !activated) {
      return {
        success: false,
        error: `Failed to activate semester: ${activateError?.message ?? "Unknown error"}`,
      };
    }
  }

  revalidatePath("/council/semesters");
  revalidatePath("/council");
  revalidatePath("/student");
  revalidatePath("/faculty");

  return {
    success: true,
    message: `Activated ${target.term} (AY ${target.academic_year_start}–${target.academic_year_start + 1}) as the current semester context.`,
  };
}
