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

export type RosterImportRowAction = "create" | "re_enroll" | "update" | "none";
export type RosterImportRowStatus = "ready" | "conflict" | "invalid";

export type RosterImportRowInput = {
  row: number;
  university_id: string;
  last_name: string;
  first_name: string;
  middle_name: string | null;
  suffix: string | null;
  email: string | null;
  year_level: number;
  academic_status: string;
};

export type RosterImportRowResult = {
  row: number;
  university_id: string;
  name: string;
  action: RosterImportRowAction;
  status: RosterImportRowStatus;
  message: string;
};

export type RosterImportPreview = {
  semester_id: string;
  ready: number;
  conflicts: number;
  invalid: number;
  created: number;
  re_enrolled: number;
  updated: number;
  rows: RosterImportRowResult[];
};

export type RosterImportPreviewResult =
  | { success: true; preview: RosterImportPreview }
  | { success: false; error: string };

export type RosterImportResult =
  | {
      success: true;
      message: string;
      summary: { total: number; created: number; re_enrolled: number; updated: number };
    }
  | {
      success: false;
      error: string;
      preview?: RosterImportPreview;
    };

/** Students per bulk-invite request; small so the progress bar moves often. */
export const BULK_INVITE_BATCH_SIZE = 5;

/** One student's result in a bulk invitation batch. */
export type BulkInviteOutcome = {
  studentId: string;
  name: string;
  status: "sent" | "email_failed" | "failed" | "skipped";
  reason?: string;
};

/** One batch: what happened to each student, and how many eligible students remain after it. */
export type BulkInviteResult =
  | { success: true; outcomes: BulkInviteOutcome[]; remaining: number }
  | { success: false; error: string };

export function countBulkOutcomes(outcomes: BulkInviteOutcome[]) {
  const counts = { sent: 0, email_failed: 0, failed: 0, skipped: 0 };
  for (const o of outcomes) counts[o.status]++;
  return counts;
}

export type InvitationEligibilitySummary = {
  totalStudents: number;
  eligibleCount: number;
  alreadyRegisteredCount: number;
  pendingCount: number;
  missingEmailCount: number;
  archivedCount: number;
  /** Eligible students whose live invitation email failed or was never confirmed; they get a fresh link. */
  resendCount: number;
};

export function isAuthorizedRosterManager(councilRole: string | null | undefined): boolean {
  return councilRole === "executive" || councilRole === "operations";
}

export function isAuthorizedDirectoryViewer(
  workspace: "council" | "faculty",
  councilRole: string | null | undefined,
  roles: string[] = []
): boolean {
  if (workspace === "council") {
    return councilRole === "executive" || councilRole === "operations";
  }
  if (workspace === "faculty") {
    return roles.includes("Academic Instructor") || roles.includes("Clinical Instructor");
  }
  return false;
}

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
  let resendCount = 0;

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
      if (s.invitation_state === "undelivered" || s.invitation_state === "unconfirmed") resendCount++;
    }
  }

  return {
    totalStudents: roster.length,
    eligibleCount,
    alreadyRegisteredCount,
    pendingCount,
    missingEmailCount,
    archivedCount,
    resendCount,
  };
}
