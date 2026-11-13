import type { Database } from "@/server/db/database.types";

type Functions = Database["public"]["Functions"];

type CandidateNullable = {
  middle_name: string | null;
  suffix: string | null;
  email: string | null;
};

type RosterNullable = CandidateNullable & {
  invitation_state: string | null;
  pending_invitation_id: string | null;
  invitation_expires_at: string | null;
};

/** One row of florence_roster: a semester enrollment and its student's names and invitation state. */
export type StudentRosterItem = Omit<Functions["florence_roster"]["Returns"][number], keyof RosterNullable> & RosterNullable;

/** One student found by exact number, shown before adding them to the roster. */
export type RosterCandidate = Omit<Functions["florence_roster_candidate"]["Returns"][number], keyof CandidateNullable> & CandidateNullable;

export type StudentActionResult =
  | { success: true; message: string }
  | { success: false; error: string };

export type BulkInviteResult = StudentActionResult & {
  totalEligible?: number;
  invitedCount?: number;
  failedCount?: number;
  emailFailedCount?: number;
};

export type InvitationEligibilitySummary = {
  totalStudents: number;
  eligibleCount: number;
  alreadyRegisteredCount: number;
  pendingCount: number;
  missingEmailCount: number;
  archivedCount: number;
};

export function isStudentEligibleForInvite(student: StudentRosterItem): boolean {
  if (student.has_account) return false;
  if (student.account_status !== "active") return false;
  if (!student.email || student.email.trim() === "") return false;
  if (student.invitation_state === "pending") return false;
  return true;
}

export function getInvitationEligibilitySummary(roster: StudentRosterItem[]): InvitationEligibilitySummary {
  let eligibleCount = 0;
  let alreadyRegisteredCount = 0;
  let pendingCount = 0;
  let missingEmailCount = 0;
  let archivedCount = 0;

  for (const s of roster) {
    if (s.account_status !== "active") {
      archivedCount++;
    } else if (s.has_account) {
      alreadyRegisteredCount++;
    } else if (s.invitation_state === "pending") {
      pendingCount++;
    } else if (!s.email || s.email.trim() === "") {
      missingEmailCount++;
    } else {
      eligibleCount++;
    }
  }

  return {
    totalStudents: roster.length,
    eligibleCount,
    alreadyRegisteredCount,
    pendingCount,
    missingEmailCount,
    archivedCount,
  };
}
