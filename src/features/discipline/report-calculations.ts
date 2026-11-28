import { z } from "zod";

import type {
  DisciplinaryReportScope,
  PeriodActivitySummary,
  ReportAcademicYearOption,
  ReportCoveredTerm,
  StudentDisciplinaryReportDemeritRow,
  StudentDisciplinaryReportMeritRow,
  StudentDisciplinaryReportServiceCreditRow,
} from "./report-contracts";

const UUID_SCHEMA = z.string().uuid();
const ACADEMIC_YEAR_REGEX = /^\d{4}$/;
const MIN_ACADEMIC_YEAR = 1900;
const MAX_ACADEMIC_YEAR = 9998;

type ReportSemesterRow = {
  id: string;
  academic_year_start: number;
  term: string;
  starts_on: string;
  ends_on: string;
  is_current: boolean;
};

type ReportEnrollmentRow = {
  semester_id: string;
  year_level: number;
  academic_status: "regular" | "irregular";
};

function parseAcademicYearStart(raw: string): number | null {
  if (!ACADEMIC_YEAR_REGEX.test(raw)) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < MIN_ACADEMIC_YEAR || parsed > MAX_ACADEMIC_YEAR) {
    return null;
  }
  return parsed;
}

function slugifyAscii(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Formats an academic year start integer as `AY YYYY–YYYY+1`. */
export function formatAcademicYearLabel(academicYearStart: number): string {
  return `AY ${academicYearStart}\u2013${academicYearStart + 1}`;
}

/** Formats a semester row as `<term> · AY YYYY–YYYY+1`. */
export function formatReportTermLabel(semester: {
  term: string;
  academic_year_start: number;
}): string {
  return `${semester.term} \u00b7 ${formatAcademicYearLabel(semester.academic_year_start)}`;
}

/**
 * Validates `?report=` and optional `?year=` search parameters on `/student/merits-demerits-and-services`.
 * Returns `null` when `report` is missing/invalid or `year` is malformed so the page can redirect cleanly.
 */
export function parseReportRouteParams(input: {
  report?: string | string[];
  year?: string | string[];
}): { scope: DisciplinaryReportScope; academicYearStart: number | null } | null {
  if (Array.isArray(input.report) && input.report.length > 1) return null;
  if (Array.isArray(input.year) && input.year.length > 1) return null;

  const rawReport = Array.isArray(input.report) ? input.report[0] : input.report;
  const rawYear = Array.isArray(input.year) ? input.year[0] : input.year;

  if (rawReport === "semester") {
    if (rawYear !== undefined) return null;
    return { scope: "semester", academicYearStart: null };
  }

  if (rawReport === "year") {
    if (rawYear === undefined) {
      return { scope: "year", academicYearStart: null };
    }
    const yearStart = parseAcademicYearStart(rawYear);
    if (yearStart === null) return null;
    return { scope: "year", academicYearStart: yearStart };
  }

  return null;
}

/**
 * Validates query parameters for `GET /student/merits-demerits-and-services/report.csv`.
 * Rejects missing, duplicate, or cross-scope parameters so the route handler returns HTTP 400.
 */
export function parseReportCsvParams(
  searchParams: URLSearchParams
):
  | { scope: "semester"; semesterId: string }
  | { scope: "year"; academicYearStart: number }
  | null {
  const scopes = searchParams.getAll("scope");
  if (scopes.length !== 1) return null;
  const scope = scopes[0];

  const semesters = searchParams.getAll("semester");
  const years = searchParams.getAll("year");

  if (scope === "semester") {
    if (semesters.length !== 1 || years.length > 0) return null;
    const parsedSemester = UUID_SCHEMA.safeParse(semesters[0]);
    if (!parsedSemester.success) return null;
    return { scope: "semester", semesterId: parsedSemester.data };
  }

  if (scope === "year") {
    if (years.length !== 1 || semesters.length > 0) return null;
    const yearStart = parseAcademicYearStart(years[0]);
    if (yearStart === null) return null;
    return { scope: "year", academicYearStart: yearStart };
  }

  return null;
}

/**
 * Derives distinct academic-year options strictly from semesters where the student is enrolled
 * or holds at least one disciplinary record, ordered newest academic year first.
 */
export function deriveStudentAcademicYears(input: {
  semesters: readonly ReportSemesterRow[];
  enrollments: readonly ReportEnrollmentRow[];
  recordSemesterIds?: Iterable<string>;
}): ReportAcademicYearOption[] {
  const enrolledIds = new Set(input.enrollments.map((e) => e.semester_id));
  const recordIds = new Set(input.recordSemesterIds ?? []);

  const termCounts = new Map<number, number>();
  const orderedYears: number[] = [];

  for (const semester of input.semesters) {
    if (!enrolledIds.has(semester.id) && !recordIds.has(semester.id)) continue;
    const year = semester.academic_year_start;
    const existingCount = termCounts.get(year);
    if (existingCount !== undefined) {
      termCounts.set(year, existingCount + 1);
      continue;
    }
    termCounts.set(year, 1);
    let insertIndex = orderedYears.length;
    for (let i = 0; i < orderedYears.length; i++) {
      if (year > orderedYears[i]) {
        insertIndex = i;
        break;
      }
    }
    orderedYears.splice(insertIndex, 0, year);
  }

  return orderedYears.map((academicYearStart) => ({
    academicYearStart,
    label: formatAcademicYearLabel(academicYearStart),
    termCount: termCounts.get(academicYearStart) ?? 0,
  }));
}

/**
 * Resolves the target semester or academic-year scope against the student's permitted semesters.
 * Returns `null` if the student has no eligible semesters or the requested period is unavailable.
 */
export function resolveReportPeriod(input: {
  scope: DisciplinaryReportScope;
  requestedSemesterId?: string | null;
  requestedAcademicYearStart?: number | null;
  semesters: readonly ReportSemesterRow[];
  enrollments: readonly ReportEnrollmentRow[];
  recordSemesterIds?: Iterable<string>;
}): {
  scope: DisciplinaryReportScope;
  periodLabel: string;
  academicYearStart: number;
  selectedTerm: string | null;
  includedSemesterIds: Set<string>;
  coveredTerms: ReportCoveredTerm[];
  availableAcademicYears: ReportAcademicYearOption[];
} | null {
  const enrollmentBySemester = new Map(
    input.enrollments.map((enrollment) => [enrollment.semester_id, enrollment])
  );
  const recordIds = new Set(input.recordSemesterIds ?? []);

  const eligibleSemesters = input.semesters.filter(
    (semester) => enrollmentBySemester.has(semester.id) || recordIds.has(semester.id)
  );
  if (eligibleSemesters.length === 0) return null;

  const availableAcademicYears = deriveStudentAcademicYears(input);

  const toCoveredTerm = (semester: ReportSemesterRow): ReportCoveredTerm => {
    const enrollment = enrollmentBySemester.get(semester.id);
    return {
      term: semester.term,
      academicYearStart: semester.academic_year_start,
      startsOn: semester.starts_on,
      endsOn: semester.ends_on,
      isCurrent: semester.is_current,
      yearLevel: enrollment?.year_level ?? null,
      academicStatus: enrollment?.academic_status ?? null,
    };
  };

  if (input.scope === "semester") {
    if (!input.requestedSemesterId) return null;
    const target = eligibleSemesters.find((s) => s.id === input.requestedSemesterId);
    if (!target) return null;
    return {
      scope: "semester",
      periodLabel: formatReportTermLabel(target),
      academicYearStart: target.academic_year_start,
      selectedTerm: target.term,
      includedSemesterIds: new Set([target.id]),
      coveredTerms: [toCoveredTerm(target)],
      availableAcademicYears,
    };
  }

  let targetYear: number | null = null;
  if (input.requestedAcademicYearStart !== null && input.requestedAcademicYearStart !== undefined) {
    const isAvailable = availableAcademicYears.some(
      (option) => option.academicYearStart === input.requestedAcademicYearStart
    );
    if (!isAvailable) return null;
    targetYear = input.requestedAcademicYearStart;
  } else {
    const fallbackSemester = input.requestedSemesterId
      ? eligibleSemesters.find((s) => s.id === input.requestedSemesterId)
      : undefined;
    targetYear =
      fallbackSemester?.academic_year_start ??
      availableAcademicYears[0]?.academicYearStart ??
      null;
  }

  if (targetYear === null) return null;

  const matchingSemesters = eligibleSemesters.filter(
    (semester) => semester.academic_year_start === targetYear
  );
  if (matchingSemesters.length === 0) return null;

  return {
    scope: "year",
    periodLabel: formatAcademicYearLabel(targetYear),
    academicYearStart: targetYear,
    selectedTerm: null,
    includedSemesterIds: new Set(matchingSemesters.map((s) => s.id)),
    coveredTerms: matchingSemesters.map(toCoveredTerm),
    availableAcademicYears,
  };
}

/** Computes period-only activity counts without duplicating cumulative bucket balance math. */
export function summarizePeriodActivity(input: {
  demerits: readonly Pick<StudentDisciplinaryReportDemeritRow, "bucket" | "status">[];
  merits: readonly Pick<StudentDisciplinaryReportMeritRow, "status">[];
  serviceCredits: readonly Pick<StudentDisciplinaryReportServiceCreditRow, "status">[];
}): PeriodActivitySummary {
  let demeritsActive = 0;
  let demeritsWaived = 0;
  let officeDemeritsActive = 0;
  let rleDemeritsActive = 0;

  for (const demerit of input.demerits) {
    if (demerit.status === "waived") {
      demeritsWaived++;
    } else {
      demeritsActive++;
      if (demerit.bucket === "office") officeDemeritsActive++;
      else rleDemeritsActive++;
    }
  }

  let meritsAvailable = 0;
  let meritsApplied = 0;
  let meritsExpired = 0;

  for (const merit of input.merits) {
    if (merit.status === "applied") meritsApplied++;
    else if (merit.status === "expired") meritsExpired++;
    else meritsAvailable++;
  }

  let serviceCreditsActive = 0;
  let serviceCreditsRevoked = 0;

  for (const credit of input.serviceCredits) {
    if (credit.status === "revoked") serviceCreditsRevoked++;
    else serviceCreditsActive++;
  }

  return {
    demeritsRecorded: input.demerits.length,
    demeritsActive,
    demeritsWaived,
    officeDemeritsActive,
    rleDemeritsActive,
    meritsAwarded: input.merits.length,
    meritsAvailable,
    meritsApplied,
    meritsExpired,
    serviceCreditsEarned: input.serviceCredits.length,
    serviceCreditsActive,
    serviceCreditsRevoked,
  };
}

/** Masks Council demerit issuers as `"Council"` and prefixes External CI sources consistently. */
export function formatDemeritIssuerLabel(input: {
  source: string;
  externalSourceName: string | null;
  issuerName: string | null;
}): string {
  if (input.source === "council") return "Council";
  if (input.source === "external_ci") {
    const trimmed = input.externalSourceName?.trim();
    return trimmed ? `External: ${trimmed}` : "External CI";
  }
  return input.issuerName ?? "Faculty";
}

/** Masks Council demerit waiver actors as `"Council"` while preserving Faculty/Coordinator display names. */
export function formatDemeritWaivedByLabel(input: {
  source: string;
  waivedAt: string | null;
  waivedByName: string | null;
}): string | null {
  if (!input.waivedAt) return null;
  if (input.source === "council") return "Council";
  return input.waivedByName ?? "Faculty";
}

/** Formats merit awarder/source attribution without exposing Council endorsers on endorsed awards. */
export function formatMeritAwarderLabel(input: {
  source: string;
  externalSourceName: string | null;
  awarderName: string | null;
}): string {
  if (input.source === "external_ci") {
    const trimmed = input.externalSourceName?.trim();
    return trimmed ? `External: ${trimmed}` : input.awarderName ?? "External CI";
  }
  if (input.awarderName) return input.awarderName;
  return input.source === "endorsement" ? "Council Endorsement" : "Instructor";
}

/** Builds a strictly sanitized lowercase ASCII `.csv` filename safe for `Content-Disposition`. */
export function buildReportFilename(input: {
  scope: DisciplinaryReportScope;
  universityId: string | null;
  academicYearStart: number;
  term?: string | null;
}): string {
  const studentSlug = slugifyAscii(input.universityId ?? "") || "student";
  const aySlug = `ay${input.academicYearStart}-${input.academicYearStart + 1}`;
  const termSlug =
    input.scope === "semester" && input.term ? slugifyAscii(input.term) : "";

  return termSlug
    ? `florence-disciplinary-report-${studentSlug}-${aySlug}-${termSlug}.csv`
    : `florence-disciplinary-report-${studentSlug}-${aySlug}.csv`;
}
