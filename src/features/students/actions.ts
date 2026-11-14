"use server";

import { guarded } from "@/features/access/provisioning-service";

import type {
  BulkInviteResult,
  RosterCandidate,
  RosterImportPreviewResult,
  RosterImportResult,
  StudentActionResult,
} from "./contracts";
import { lookupRosterCandidate } from "./queries";
import {
  addStudentToRoster,
  applyRosterImport,
  bulkInviteStudents,
  cancelStudentInvitation,
  inviteStudent,
  previewRosterImport,
  updateStudentRosterEntry,
} from "./service";

export async function createStudentAction(_prev: StudentActionResult | null, formData: FormData): Promise<StudentActionResult> {
  return guarded(() => addStudentToRoster(Object.fromEntries(formData)));
}

export async function updateStudentAction(_prev: StudentActionResult | null, formData: FormData): Promise<StudentActionResult> {
  return guarded(() => updateStudentRosterEntry(Object.fromEntries(formData)));
}

/** Throws on denial or failure so the dialog can show an error instead of "new student". */
export async function lookupStudentAction(universityId: string): Promise<RosterCandidate | null> {
  return lookupRosterCandidate(universityId);
}

export async function previewRosterImportAction(
  csvText: string,
): Promise<RosterImportPreviewResult> {
  return guarded(() => previewRosterImport({ csvText }));
}

export async function applyRosterImportAction(
  requestKey: string,
  csvText: string,
): Promise<RosterImportResult> {
  return guarded(() => applyRosterImport({ requestKey, csvText }));
}

export async function inviteStudentDirectAction(studentId: string): Promise<StudentActionResult> {
  return guarded(() => inviteStudent({ studentId }));
}

export async function cancelStudentInvitationDirectAction(invitationId: string): Promise<StudentActionResult> {
  return guarded(() => cancelStudentInvitation({ invitationId }));
}

export async function bulkInviteStudentsDirectAction(semesterId: string, excludeIds: string[]): Promise<BulkInviteResult> {
  return guarded(() => bulkInviteStudents({ semesterId, excludeIds }));
}
