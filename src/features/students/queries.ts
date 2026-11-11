import "server-only";

import { getAccessContext } from "@/server/auth/access-context";
import { createCommandClient } from "@/server/db/command-client";
import type { StudentConflictPreview, StudentRosterItem } from "./contracts";
import type { StudentFilterInput } from "./schemas";

/**
 * Retrieve roster entries for a given semester, ordered by year level and student name.
 * Requires an active Council or Faculty session.
 */
export async function getRoster(
  semesterId: string,
  filters?: StudentFilterInput,
): Promise<StudentRosterItem[]> {
  const context = await getAccessContext();
  if (context.status !== "ready") {
    throw new Error("Authentication required to view student roster.");
  }
  if (!context.workspaces.includes("council") && !context.workspaces.includes("faculty")) {
    throw new Error("Access denied to student roster.");
  }

  const commandClient = createCommandClient();
  let query = commandClient
    .from("enrollments")
    .select(
      `
      id,
      student_id,
      semester_id,
      year_level,
      academic_status,
      created_at,
      updated_at,
      student:profiles!inner (
        id,
        auth_user_id,
        university_id,
        first_name,
        middle_name,
        last_name,
        suffix,
        email,
        account_status
      )
    `,
    )
    .eq("semester_id", semesterId);

  if (filters?.year_level) {
    query = query.eq("year_level", filters.year_level);
  }
  if (filters?.academic_status && filters.academic_status !== "all") {
    query = query.eq("academic_status", filters.academic_status);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load student roster: ${error.message}`);
  }

  if (!data) return [];

  // Map into domain items
  let items: StudentRosterItem[] = data.map((row) => {
    // PostgREST types student as a single object or array depending on relation cardinality
    const profile = Array.isArray(row.student) ? row.student[0] : row.student;
    return {
      enrollment_id: row.id,
      student_id: row.student_id,
      semester_id: row.semester_id,
      university_id: profile?.university_id ?? "",
      first_name: profile?.first_name ?? "",
      middle_name: profile?.middle_name ?? null,
      last_name: profile?.last_name ?? "",
      suffix: profile?.suffix ?? null,
      email: profile?.email ?? null,
      year_level: row.year_level,
      academic_status: row.academic_status,
      account_status: profile?.account_status ?? "active",
      has_auth_account: Boolean(profile?.auth_user_id),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });

  // Client-side text search by student number or full name
  if (filters?.search && filters.search.trim() !== "") {
    const q = filters.search.trim().toLowerCase();
    items = items.filter((item) => {
      const studentNum = item.university_id.toLowerCase();
      const fullName = `${item.last_name} ${item.first_name} ${item.middle_name ?? ""} ${item.suffix ?? ""}`.toLowerCase();
      return studentNum.includes(q) || fullName.includes(q);
    });
  }

  // Sort by year level ASC, then family name ASC, given name ASC
  items.sort((a, b) => {
    if (a.year_level !== b.year_level) {
      return a.year_level - b.year_level;
    }
    const nameA = `${a.last_name}, ${a.first_name}`.toLowerCase();
    const nameB = `${b.last_name}, ${b.first_name}`.toLowerCase();
    return nameA.localeCompare(nameB);
  });

  return items;
}

/**
 * Check if a student already exists in public.profiles and if they are enrolled in the active semester.
 * Used for real-time conflict preview during manual student creation.
 */
export async function lookupStudentByUniversityId(
  universityId: string,
  activeSemesterId: string,
): Promise<StudentConflictPreview> {
  const context = await getAccessContext();
  if (context.status !== "ready") {
    throw new Error("Authentication required.");
  }

  const cleanNumber = universityId.trim();
  const commandClient = createCommandClient();

  const { data: profile } = await commandClient
    .from("profiles")
    .select("id, university_id, first_name, middle_name, last_name, suffix, email")
    .eq("university_id", cleanNumber)
    .maybeSingle();

  if (!profile) {
    return {
      exists: false,
      university_id: cleanNumber,
      is_enrolled_in_active_semester: false,
    };
  }

  // Check enrollment in active semester
  const { data: enrollment } = await commandClient
    .from("enrollments")
    .select("id, year_level, academic_status")
    .eq("student_id", profile.id)
    .eq("semester_id", activeSemesterId)
    .maybeSingle();

  return {
    exists: true,
    student_id: profile.id,
    university_id: cleanNumber,
    first_name: profile.first_name,
    middle_name: profile.middle_name,
    last_name: profile.last_name,
    suffix: profile.suffix,
    email: profile.email,
    is_enrolled_in_active_semester: Boolean(enrollment),
    active_semester_year_level: enrollment?.year_level,
    active_semester_academic_status: enrollment?.academic_status,
  };
}
