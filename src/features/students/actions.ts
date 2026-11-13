"use server";

import { guarded } from "@/features/access/provisioning-service";

import type { BulkInviteResult, RosterCandidate, StudentActionResult } from "./contracts";
import { lookupRosterCandidate } from "./queries";
import {
  addStudentToRoster,
  bulkInviteStudents,
  cancelStudentInvitation,
  inviteStudent,
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

export async function inviteStudentAction(_prev: StudentActionResult | null, formData: FormData): Promise<StudentActionResult> {
  return guarded(() => inviteStudent(Object.fromEntries(formData)));
}

export async function inviteStudentDirectAction(studentId: string): Promise<StudentActionResult> {
  return guarded(() => inviteStudent({ studentId }));
}

export async function cancelStudentInvitationAction(_prev: StudentActionResult | null, formData: FormData): Promise<StudentActionResult> {
  return guarded(() => cancelStudentInvitation(Object.fromEntries(formData)));
}

export async function cancelStudentInvitationDirectAction(invitationId: string): Promise<StudentActionResult> {
  return guarded(() => cancelStudentInvitation({ invitationId }));
}

export async function bulkInviteStudentsAction(_prev: BulkInviteResult | null, formData: FormData): Promise<BulkInviteResult> {
  return guarded(() => bulkInviteStudents(Object.fromEntries(formData)));
}

export async function bulkInviteStudentsDirectAction(semesterId: string): Promise<BulkInviteResult> {
  return guarded(() => bulkInviteStudents({ semesterId }));
}
