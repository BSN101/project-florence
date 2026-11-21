import type { StudentRosterItem } from "@/features/students/contracts";
import type { Database } from "@/server/db/database.types";

type Tables = Database["public"]["Tables"];

/** Duty bucket for service sessions: Office Duty ("office") or Clinical/RLE Duty ("rle"). */
export type ServiceBucket = Database["public"]["Enums"]["bucket"];

/** Service session row as stored in the database. */
export type ServiceSessionRecord = Tables["service_sessions"]["Row"];

/** Participant row linking a student to a service session. */
export type ServiceParticipantRecord = Tables["service_participants"]["Row"];

/**
 * Attendance status for a service participant in an open or ended session:
 * - "not_recorded": no time-in or time-out recorded yet.
 * - "in_progress": timed in within window, waiting for time-out.
 * - "present_on_time": timed in on or before scheduled start + late grace period, and timed out.
 * - "late": timed in after late grace period but within window, and timed out.
 * - "missing_time_in": time-out recorded without a valid time-in.
 * - "missing_time_out": time-in recorded, window closed, but no time-out recorded.
 * - "excluded": student explicitly excluded/excused by the instructor prior to finalization.
 */
export type AttendanceStatus =
  | "not_recorded"
  | "in_progress"
  | "present_on_time"
  | "late"
  | "missing_time_in"
  | "missing_time_out"
  | "excluded";

/** Breakdown of participant statuses for a service session. */
export type ServiceSessionParticipantCounts = {
  total: number;
  presentOnTime: number;
  late: number;
  inProgress: number;
  missingTimeIn: number;
  missingTimeOut: number;
  notRecorded: number;
  excluded: number;
};

/** Summary of a service session for table/list views. */
export type ServiceSessionSummary = ServiceSessionRecord & {
  creator_name: string | null;
  participant_counts: ServiceSessionParticipantCounts;
};

/**
 * Detailed participant record joining the attendance row with student profile data
 * and computed attendance status.
 */
export type ServiceParticipantDetail = ServiceParticipantRecord & {
  university_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  year_level: number | null;
  status: AttendanceStatus;
};

/** Detailed view of a single service session and all its participants. */
export type ServiceSessionDetail = ServiceSessionRecord & {
  creator_name: string | null;
  participant_counts: ServiceSessionParticipantCounts;
  participants: ServiceParticipantDetail[];
};

/** Candidate enrolled student eligible to be added to a service session. */
export type AvailableServiceStudent = Pick<
  StudentRosterItem,
  | "student_id"
  | "university_id"
  | "first_name"
  | "middle_name"
  | "last_name"
  | "suffix"
  | "year_level"
  | "academic_status"
>;

/** Payload shape for updating or adding participant attendance rows. */
export type ParticipantAttendanceInput = {
  studentId: string;
  timeIn: string | null;
  timeOut: string | null;
  excluded: boolean;
};

/** Result of creating a service session. */
export type CreateServiceSessionResult =
  | { success: true; sessionId: string }
  | { success: false; error: string; retryable?: true };

/** Result of updating service session participants and attendance. */
export type SetServiceParticipantsResult =
  | { success: true; updatedCount: number }
  | { success: false; error: string; retryable?: true };
