"use server";

import type { StudentActionResult, StudentConflictPreview } from "./contracts";
import { lookupStudentByUniversityId } from "./queries";
import { addStudentToRoster, updateStudentRosterEntry } from "./service";

export async function createStudentAction(
  _prevState: StudentActionResult | null,
  formData: FormData,
): Promise<StudentActionResult> {
  const activeSemesterId = formData.get("semester_id");
  if (!activeSemesterId || typeof activeSemesterId !== "string") {
    return { success: false, error: "Active semester ID is required." };
  }

  const universityId = formData.get("university_id");
  const lastName = formData.get("last_name");
  const firstName = formData.get("first_name");
  const middleName = formData.get("middle_name");
  const suffix = formData.get("suffix");
  const email = formData.get("email");
  const yearLevelRaw = formData.get("year_level");
  const academicStatus = formData.get("academic_status");

  return await addStudentToRoster(
    {
      university_id: universityId,
      last_name: lastName,
      first_name: firstName,
      middle_name: middleName,
      suffix: suffix,
      email: email,
      year_level: yearLevelRaw ? Number(yearLevelRaw) : NaN,
      academic_status: academicStatus,
    },
    activeSemesterId,
  );
}

export async function updateStudentAction(
  _prevState: StudentActionResult | null,
  formData: FormData,
): Promise<StudentActionResult> {
  const activeSemesterId = formData.get("semester_id");
  if (!activeSemesterId || typeof activeSemesterId !== "string") {
    return { success: false, error: "Active semester ID is required." };
  }

  const studentId = formData.get("student_id");
  const lastName = formData.get("last_name");
  const firstName = formData.get("first_name");
  const middleName = formData.get("middle_name");
  const suffix = formData.get("suffix");
  const email = formData.get("email");
  const yearLevelRaw = formData.get("year_level");
  const academicStatus = formData.get("academic_status");

  return await updateStudentRosterEntry(
    {
      student_id: studentId,
      last_name: lastName,
      first_name: firstName,
      middle_name: middleName,
      suffix: suffix,
      email: email,
      year_level: yearLevelRaw ? Number(yearLevelRaw) : NaN,
      academic_status: academicStatus,
    },
    activeSemesterId,
  );
}

export async function lookupStudentAction(
  universityId: string,
  activeSemesterId: string,
): Promise<StudentConflictPreview> {
  try {
    return await lookupStudentByUniversityId(universityId, activeSemesterId);
  } catch {
    return {
      exists: false,
      university_id: universityId,
      is_enrolled_in_active_semester: false,
    };
  }
}
