"use server";

import { guarded } from "@/features/access/provisioning-service";

import type {
  RosterCandidate,
  RosterImportPreviewResult,
  RosterImportResult,
  StudentActionResult,
} from "./contracts";
import { lookupRosterCandidate } from "./queries";
import {
  addStudentToRoster,
  applyRosterImport,
  previewRosterImport,
  updateStudentRosterEntry,
} from "./service";

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

export async function previewRosterImportAction(
  csvText: string,
): Promise<RosterImportPreviewResult> {
  return guarded(() => previewRosterImport({ csvText })) as Promise<RosterImportPreviewResult>;
}

export async function applyRosterImportAction(
  requestKey: string,
  csvText: string,
): Promise<RosterImportResult> {
  return guarded(() => applyRosterImport({ requestKey, csvText })) as Promise<RosterImportResult>;
}
