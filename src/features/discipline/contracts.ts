import type { StudentRosterItem } from "@/features/students/contracts";
import type { Database } from "@/server/db/database.types";

type Tables = Database["public"]["Tables"];

export type DisciplinaryBucket = Database["public"]["Enums"]["bucket"]; // "office" | "rle"

/** Student identity on Council rows; resolved through `florence_discipline_names`. */
type StudentIdentity = {
  student_university_id?: string | null;
  student_name?: string | null;
};

export type DemeritRecord = Tables["demerits"]["Row"] & StudentIdentity & {
  misconduct_label: string | null;
  issuer_name: string | null;
  waived_by_name: string | null;
};

export type MeritRecord = Omit<Tables["merits"]["Row"], "award_request_key" | "award_unit_index"> & {
  awarder_name: string | null;
  // Omitted for ordinary instructors, who cannot see merit applications.
  isApplied?: boolean;
  isExpired?: boolean;
  appliedBucket?: DisciplinaryBucket | null;
};

/**
 * Unexpired, unapplied merit unit for FIFO selection and application preview.
 * Includes description so students can review the merit reason alongside validity dates.
 */
export type AvailableMerit = Pick<
  MeritRecord,
  "id" | "awarded_on" | "expires_on" | "description"
>;

export type MeritApplicationRecord = Tables["merit_applications"]["Row"];

/** One student merit application, shown on the result card. */
export type StudentMeritApplicationGroup = Pick<
  MeritApplicationRecord,
  "application_group_id" | "bucket" | "applied_at"
> & { applied_days: number };

export type ServiceCreditRecord = Omit<Tables["service_credits"]["Row"], "session_id"> & {
  issuer_name: string | null;
};

export type MeritEndorsementRecord = Tables["merit_endorsements"]["Row"] & StudentIdentity & {
  assigned_instructor_name: string | null;
  submitter_name: string | null;
  // Merit units created by approval (FL-029 "origin merit activity"); not their later use.
  awarded_days: number;
};

export type BucketDisciplinaryBalance = {
  bucket: DisciplinaryBucket;
  totalDemerits: number;
  waivedDemerits: number;
  activeDemerits: number;
  appliedMerits: number;
  activeServiceCredits: number;
  revokedServiceCredits: number;
  balance: number; // authoritative f_cmd_balance: activeDemerits - appliedMerits - activeServiceCredits
};

export type StudentDisciplinarySummary = {
  office: BucketDisciplinaryBalance;
  rle: BucketDisciplinaryBalance;
  merits: {
    totalAwarded: number;
    totalApplied: number;
    available: number;
    expired: number;
  };
  totalActiveDemerits: number;
  totalActiveBalance: number;
  hasOutstandingDebt: boolean;
};

export type DisciplinaryLedger = {
  demerits: DemeritRecord[];
  merits: MeritRecord[];
  serviceCredits: ServiceCreditRecord[];
};

export type FacultyDisciplinaryViewData = DisciplinaryLedger & {
  isCoordinator: boolean;
  summary: StudentDisciplinarySummary | null;
};

export type CouncilDisciplinaryViewData = {
  demerits: CouncilDemeritRecord[];
  endorsements: MeritEndorsementRecord[];
};

/** The roster fields the award picker needs; nothing else leaves the server. */
export type AwardRecipientOption = {
  student_id: string;
  university_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  year_level: number;
};

export type FacultyMeritGroup = {
  id: string;
  student_id: string;
  student_name: string | null;
  student_university_id: string | null;
  semester_id: string;
  description: string;
  awarded_on: string;
  expires_on: string;
  days: number;
  created_at: string;
};

/** Active misconduct catalog option for the demerit-logging picker. */
export type MisconductOption = {
  id: string;
  label: string;
  is_other: boolean;
};

/** The roster fields the merit endorsement picker needs; the page maps to exactly these, so nothing else leaves the server. */
export type MeritEndorsementRecipientOption = Pick<
  StudentRosterItem,
  "student_id" | "university_id" | "first_name" | "middle_name" | "last_name" | "suffix" | "year_level"
>;

/** Active instructor choice for Council merit endorsement assignment. */
export type InstructorChoice = Database["public"]["Functions"]["florence_instructor_choices"]["Returns"][number];

export type MeritEndorsementDecision = "approved" | "rejected";

/**
 * Faculty-scoped merit endorsement row for `/faculty/merit-endorsements` (FL-032).
 * Strips `student_id`, `semester_id`, `assigned_instructor_id`, `submitted_by`, and
 * `decided_by` so only rendered fields and `id` (for `decide_merit_endorsement`) reach the client.
 */
export type FacultyMeritEndorsementRecord = Pick<
  Tables["merit_endorsements"]["Row"],
  "id" | "description" | "requested_days" | "status" | "submitted_at" | "decided_at" | "decision_reason"
> &
  StudentIdentity & {
    submitter_name: string | null;
    awarded_days: number;
    awarded_on: string | null;
    expires_on: string | null;
    canDecide: boolean;
  };

export type FacultyEndorsementCounts = {
  pending: number;
  approved: number;
  rejected: number;
};

export type DecideMeritEndorsementResult =
  | { success: true; endorsementId: string; status: MeritEndorsementDecision; unitCount: number }
  | { success: false; error: string; retryable?: true };

export type DemeritSource = "faculty" | "council" | "external_ci";

/**
 * Faculty-scoped demerit unit row for `/faculty/my-merits-and-demerits` (FL-034).
 * Strips internal actor/student/group/attendance/catalog UUIDs so only rendered fields and `id` reach the client.
 */
export type FacultyDemeritUnitRecord = Pick<
  Tables["demerits"]["Row"],
  | "id"
  | "incident_unit_index"
  | "bucket"
  | "description"
  | "incident_on"
  | "waived_at"
  | "waiver_reason"
  | "created_at"
> &
  StudentIdentity & {
    source: "faculty";
    group_unit_count: number;
    waived_by_name: string | null;
    canWaive: boolean;
  };

/**
 * Council-scoped demerit unit row for `/council/merit-endorsements-and-council-demerits` (FL-034).
 * Strips internal actor/student/attendance/catalog UUIDs so only rendered fields and `id` reach the client.
 */
export type CouncilDemeritRecord = Pick<
  Tables["demerits"]["Row"],
  | "id"
  | "bucket"
  | "description"
  | "incident_on"
  | "consequence_outcome"
  | "source_unit_index"
  | "waived_at"
  | "waiver_reason"
  | "created_at"
> &
  StudentIdentity & {
    source: "council";
    issuer_name: string | null;
    waived_by_name: string | null;
    canWaive: boolean;
  };

/** Minimal unit context needed by the shared `WaiveDemeritDialog` across Faculty, Council, and External CI views. */
export type WaiveDemeritTarget = {
  id: string;
  student_name: string | null;
  student_university_id: string | null;
  bucket: DisciplinaryBucket;
  source: DemeritSource;
  description: string;
  incident_on: string;
  unitLabel?: string | null;
  external_source_name?: string | null;
};

export type WaiveDemeritResult =
  | { success: true; demeritId: string; waivedAt: string }
  | { success: false; error: string; retryable?: true };
