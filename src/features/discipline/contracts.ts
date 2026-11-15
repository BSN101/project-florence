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
};

export type MeritApplicationRecord = Tables["merit_applications"]["Row"];

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
  demerits: DemeritRecord[];
  endorsements: MeritEndorsementRecord[];
};
