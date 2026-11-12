"use server";

import { guarded } from "@/features/access/provisioning-service";

import type { RosterCandidate, StudentActionResult } from "./contracts";
import { lookupRosterCandidate } from "./queries";
import { addStudentToRoster, updateStudentRosterEntry } from "./service";

export async function createStudentAction(_prev: StudentActionResult | null, formData: FormData) {
  return guarded(() => addStudentToRoster(Object.fromEntries(formData)));
}

export async function updateStudentAction(_prev: StudentActionResult | null, formData: FormData) {
  return guarded(() => updateStudentRosterEntry(Object.fromEntries(formData)));
}

/** Throws on denial or failure so the dialog can show an error instead of "new student". */
export async function lookupStudentAction(universityId: string): Promise<RosterCandidate | null> {
  return lookupRosterCandidate(universityId);
}
