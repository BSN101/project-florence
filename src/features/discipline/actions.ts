"use server";

import type { FacultyDisciplinaryViewData } from "./contracts";
import { getStudentDisciplinaryLedger } from "./queries";

/**
 * Server action to fetch permitted student disciplinary details for Faculty.
 * Keeps all database queries strictly server-side.
 */
export async function getStudentDisciplinaryLedgerAction(
  studentId: string
): Promise<FacultyDisciplinaryViewData> {
  return getStudentDisciplinaryLedger(studentId);
}
