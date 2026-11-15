import type { Database } from "@/server/db/database.types";

export type DisciplinaryBucket = Database["public"]["Enums"]["bucket"]; // "office" | "rle"

export type DemeritRecord = {
  id: string;
  incident_group_id: string;
  incident_unit_index: number;
  student_id: string;
  student_university_id?: string | null;
  student_name?: string | null;
  semester_id: string;
  bucket: DisciplinaryBucket;
  source: "faculty" | "council" | "external_ci" | string;
  misconduct_id: string | null;
  misconduct_label?: string | null;
  description: string;
  incident_on: string; // YYYY-MM-DD
  event_attendance_id: string | null;
  consequence_outcome: "absence" | "late" | string | null;
  source_unit_index: number | null;
  issued_by: string;
  issuer_name?: string | null;
  external_source_name: string | null;
  waived_at: string | null;
  waived_by: string | null;
  waived_by_name?: string | null;
  waiver_reason: string | null;
  created_at: string;
};

export type MeritRecord = {
  id: string;
  student_id: string;
  student_university_id?: string | null;
  student_name?: string | null;
  semester_id: string;
  source: "direct" | "endorsement" | "external_ci" | string;
  endorsement_id: string | null;
  endorsement_unit_index: number | null;
  description: string;
  awarded_on: string; // YYYY-MM-DD
  expires_on: string; // YYYY-MM-DD
  awarded_by: string;
  awarder_name?: string | null;
  external_source_name: string | null;
  created_at: string;
  isApplied?: boolean;
  isExpired?: boolean;
};

export type MeritApplicationRecord = {
  id: string;
  application_group_id: string;
  student_id: string;
  merit_id: string;
  bucket: DisciplinaryBucket;
  applied_at: string;
};

export type ServiceCreditRecord = {
  id: string;
  student_id: string;
  student_university_id?: string | null;
  student_name?: string | null;
  semester_id: string;
  bucket: DisciplinaryBucket;
  service_participant_id: string;
  issued_by: string;
  issuer_name?: string | null;
  issued_at: string;
  revoked_by: string | null;
  revoked_at: string | null;
  revocation_reason: string | null;
};

export type MeritEndorsementRecord = {
  id: string;
  student_id: string;
  student_university_id?: string | null;
  student_name?: string | null;
  semester_id: string;
  assigned_instructor_id: string;
  assigned_instructor_name?: string | null;
  description: string;
  requested_days: number;
  status: "pending" | "approved" | "rejected";
  submitted_by: string;
  submitter_name?: string | null;
  submitted_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
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

export type FacultyDisciplinaryViewData = {
  isCoordinator: boolean;
  student: {
    id: string;
    universityId?: string | null;
    fullName?: string | null;
  };
  summary: StudentDisciplinarySummary | null;
  demerits: DemeritRecord[];
  merits: MeritRecord[];
  serviceCredits: ServiceCreditRecord[];
};

export type CouncilDisciplinaryViewData = {
  demerits: DemeritRecord[];
  endorsements: MeritEndorsementRecord[];
};
