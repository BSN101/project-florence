import "server-only";

import { revalidatePath } from "next/cache";
import { getAccessContext } from "@/server/auth/access-context";
import { createCommandClient } from "@/server/db/command-client";
import type { StudentActionResult } from "./contracts";
import {
  createStudentSchema,
  updateStudentSchema,
} from "./schemas";

export class StudentServiceError extends Error {
  constructor(message: string, public readonly code: string = "BAD_REQUEST") {
    super(message);
    this.name = "StudentServiceError";
  }
}

/**
 * Authorize Council Executive or Council Operations actor.
 * Representatives, faculty, and students are strictly denied.
 */
export async function requireRosterManager() {
  const context = await getAccessContext();
  if (context.status !== "ready") {
    throw new StudentServiceError("Authentication required", "UNAUTHENTICATED");
  }
  if (context.councilRole !== "executive" && context.councilRole !== "operations") {
    throw new StudentServiceError(
      "Only Council Executive or Operations members may manage the student roster",
      "FORBIDDEN",
    );
  }
  return context;
}

/**
 * Add a student to the roster for the active semester.
 * Invariant (Identity Continuity):
 *   - If university_id exists in profiles: re-uses existing profile ID to preserve
 *     historical record relationships (dues, merits, demerits, clearance).
 *   - If university_id is new: creates a new profile record.
 * Invariant (Duplicate Enrollment Guard):
 *   - Enforces unique enrollment per (student_id, semester_id). If already enrolled,
 *     blocks duplicate and returns actionable error.
 */
export async function addStudentToRoster(
  rawInput: unknown,
  activeSemesterId: string,
): Promise<StudentActionResult> {
  await requireRosterManager();

  const parsed = createStudentSchema.safeParse(rawInput);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues.map((i) => i.message).join(", ");
    return { success: false, error: errorMsg };
  }

  const input = parsed.data;
  const commandClient = createCommandClient();

  // Verify target semester exists
  const { data: semester, error: semesterError } = await commandClient
    .from("semesters")
    .select("id, is_current")
    .eq("id", activeSemesterId)
    .maybeSingle();

  if (semesterError || !semester) {
    return { success: false, error: "Active semester not found." };
  }

  let studentId: string;

  // 1. Identity Continuity: Check if profile with university_id already exists
  const { data: existingProfile } = await commandClient
    .from("profiles")
    .select("id, university_id, first_name, last_name")
    .eq("university_id", input.university_id)
    .maybeSingle();

  if (existingProfile) {
    studentId = existingProfile.id;
  } else {
    // Insert new profile
    const now = new Date().toISOString();
    const { data: newProfile, error: profileInsertError } = await commandClient
      .from("profiles")
      .insert({
        university_id: input.university_id,
        first_name: input.first_name,
        last_name: input.last_name,
        middle_name: input.middle_name,
        suffix: input.suffix,
        email: input.email,
        account_status: "active",
        updated_at: now,
      })
      .select("id")
      .single();

    if (profileInsertError || !newProfile) {
      if (profileInsertError?.code === "23505") {
        // Race condition duplicate university_id
        const { data: racedProfile } = await commandClient
          .from("profiles")
          .select("id")
          .eq("university_id", input.university_id)
          .single();
        if (racedProfile) {
          studentId = racedProfile.id;
        } else {
          return { success: false, error: "Failed to resolve student profile." };
        }
      } else {
        return {
          success: false,
          error: `Failed to create student profile: ${profileInsertError?.message ?? "Database error"}`,
        };
      }
    } else {
      studentId = newProfile.id;
    }
  }

  // 2. Duplicate Enrollment Guard: Check if student is already enrolled in this semester
  const { data: existingEnrollment } = await commandClient
    .from("enrollments")
    .select("id")
    .eq("student_id", studentId)
    .eq("semester_id", activeSemesterId)
    .maybeSingle();

  if (existingEnrollment) {
    return {
      success: false,
      error: `Student ${input.university_id} is already enrolled in this semester.`,
    };
  }

  // 3. Insert enrollment
  const now = new Date().toISOString();
  const { error: enrollmentError } = await commandClient.from("enrollments").insert({
    student_id: studentId,
    semester_id: activeSemesterId,
    year_level: input.year_level,
    academic_status: input.academic_status,
    updated_at: now,
  });

  if (enrollmentError) {
    if (enrollmentError.code === "23505") {
      return {
        success: false,
        error: `Student ${input.university_id} is already enrolled in this semester.`,
      };
    }
    return {
      success: false,
      error: `Failed to enroll student: ${enrollmentError.message}`,
    };
  }

  revalidatePath("/council");
  return {
    success: true,
    message: `Added ${input.last_name}, ${input.first_name} (${input.university_id}) to roster successfully.`,
  };
}

/**
 * Update student demographic details and current semester enrollment attributes.
 * Updates profiles for demographic fields and enrollments for academic attributes.
 */
export async function updateStudentRosterEntry(
  rawInput: unknown,
  activeSemesterId: string,
): Promise<StudentActionResult> {
  await requireRosterManager();

  const parsed = updateStudentSchema.safeParse(rawInput);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues.map((i) => i.message).join(", ");
    return { success: false, error: errorMsg };
  }

  const input = parsed.data;
  const commandClient = createCommandClient();
  const now = new Date().toISOString();

  // 1. Update demographics in public.profiles
  const { error: profileError } = await commandClient
    .from("profiles")
    .update({
      first_name: input.first_name,
      last_name: input.last_name,
      middle_name: input.middle_name,
      suffix: input.suffix,
      email: input.email,
      updated_at: now,
    })
    .eq("id", input.student_id);

  if (profileError) {
    return {
      success: false,
      error: `Failed to update student profile: ${profileError.message}`,
    };
  }

  // 2. Update current semester enrollment attributes
  const { error: enrollmentError } = await commandClient
    .from("enrollments")
    .update({
      year_level: input.year_level,
      academic_status: input.academic_status,
      updated_at: now,
    })
    .eq("student_id", input.student_id)
    .eq("semester_id", activeSemesterId);

  if (enrollmentError) {
    return {
      success: false,
      error: `Failed to update semester enrollment: ${enrollmentError.message}`,
    };
  }

  revalidatePath("/council");
  return {
    success: true,
    message: `Updated student record for ${input.last_name}, ${input.first_name} successfully.`,
  };
}
