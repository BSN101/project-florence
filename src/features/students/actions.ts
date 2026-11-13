"use server";

import { guarded } from "@/features/access/provisioning-service";
import { AccessDeniedError } from "@/server/auth/require-workspace";

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

async function guardedAction<T extends { success: true } | { success: false; error: string }>(
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return { success: false, error: "You are not permitted to make this change." } as T;
    }
    return { success: false, error: "We couldn't complete that change. Please try again." } as T;
  }
}

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
  return guardedAction(() => previewRosterImport({ csvText }));
}

export async function applyRosterImportAction(
  requestKey: string,
  csvText: string,
): Promise<RosterImportResult> {
  return guardedAction(() => applyRosterImport({ requestKey, csvText }));
}
