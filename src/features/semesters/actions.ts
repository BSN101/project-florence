"use server";

import type { SemesterActionResult } from "./contracts";
import { activateSemester, createSemester } from "./service";

export async function createSemesterAction(
  _prevState: SemesterActionResult | null,
  formData: FormData,
): Promise<SemesterActionResult> {
  const academicYearStartRaw = formData.get("academic_year_start");
  const academicYearStart = academicYearStartRaw ? Number(academicYearStartRaw) : NaN;
  const term = formData.get("term");
  const startsOn = formData.get("starts_on");
  const endsOn = formData.get("ends_on");

  return await createSemester({
    academic_year_start: academicYearStart,
    term,
    starts_on: startsOn,
    ends_on: endsOn,
  });
}

export async function activateSemesterAction(
  _prevState: SemesterActionResult | null,
  formData: FormData,
): Promise<SemesterActionResult> {
  const semesterId = formData.get("semester_id") ?? formData.get("semesterId");
  return await activateSemester({ semesterId });
}
