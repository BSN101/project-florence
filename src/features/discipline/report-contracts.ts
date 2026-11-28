import type { DisciplinaryBucket, StudentDisciplinarySummary } from "./contracts";

export type DisciplinaryReportScope = "semester" | "year";

export type ReportAcademicYearOption = {
  academicYearStart: number;
  label: string;
  termCount: number;
};

export type ReportCoveredTerm = {
  term: string;
  academicYearStart: number;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
  yearLevel: number | null;
  academicStatus: "regular" | "irregular" | null;
};

export type PeriodActivitySummary = {
  demeritsRecorded: number;
  demeritsActive: number;
  demeritsWaived: number;
  officeDemeritsActive: number;
  rleDemeritsActive: number;
  meritsAwarded: number;
  meritsAvailable: number;
  meritsApplied: number;
  meritsExpired: number;
  serviceCreditsEarned: number;
  serviceCreditsActive: number;
  serviceCreditsRevoked: number;
};

/**
 * Stripped student demerit row for the FL-045 report.
 * Excludes raw student_id, semester_id, actor UUIDs, incident_group_id, misconduct_id, and event_attendance_id.
 */
export type StudentDisciplinaryReportDemeritRow = {
  id: string;
  incident_on: string;
  bucket: DisciplinaryBucket;
  source: "faculty" | "council" | "external_ci";
  misconduct_label: string | null;
  description: string;
  consequence_outcome: string | null;
  source_unit_index: number | null;
  incident_unit_index: number;
  group_unit_count: number;
  term_label: string;
  status: "active" | "waived";
  waived_at: string | null;
  waiver_reason: string | null;
  issuer_label: string;
  waived_by_label: string | null;
};

/**
 * Stripped student merit row for the FL-045 report.
 * Excludes raw student_id, semester_id, awarded_by, award_request_key, endorsement_id, and merit_id.
 */
export type StudentDisciplinaryReportMeritRow = {
  id: string;
  awarded_on: string;
  expires_on: string;
  source: "direct" | "endorsement" | "external_ci";
  description: string;
  term_label: string;
  status: "available" | "applied" | "expired";
  applied_bucket: DisciplinaryBucket | null;
  applied_at: string | null;
  awarder_label: string;
};

/**
 * Stripped student service-credit row for the FL-045 report.
 * Excludes raw student_id, semester_id, session_id, service_participant_id, issued_by, and revoked_by.
 */
export type StudentDisciplinaryReportServiceCreditRow = {
  id: string;
  issued_at: string;
  bucket: DisciplinaryBucket;
  term_label: string;
  status: "active" | "revoked";
  revoked_at: string | null;
  revocation_reason: string | null;
  supervisor_label: string;
};

export type StudentDisciplinaryReportData = {
  scope: DisciplinaryReportScope;
  periodLabel: string;
  academicYearStart: number;
  generatedAt: string;
  asOfDateManila: string;
  student: {
    fullName: string;
    universityId: string;
  };
  coveredTerms: ReportCoveredTerm[];
  availableAcademicYears: ReportAcademicYearOption[];
  cumulativeSummary: StudentDisciplinarySummary;
  periodSummary: PeriodActivitySummary;
  demerits: StudentDisciplinaryReportDemeritRow[];
  merits: StudentDisciplinaryReportMeritRow[];
  serviceCredits: StudentDisciplinaryReportServiceCreditRow[];
};
