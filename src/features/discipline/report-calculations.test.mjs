import assert from "node:assert/strict";
import test from "node:test";

import { formatManilaDate, formatManilaDateTime } from "../../lib/manila-date.ts";
import { calculateDisciplinarySummary, getTodayManila } from "./calculations.ts";
import {
  buildReportFilename,
  deriveStudentAcademicYears,
  formatAcademicYearLabel,
  formatDemeritIssuerLabel,
  formatDemeritWaivedByLabel,
  formatMeritAwarderLabel,
  formatReportTermLabel,
  parseReportCsvParams,
  parseReportRouteParams,
  resolveReportPeriod,
  summarizePeriodActivity,
} from "./report-calculations.ts";
import { escapeCsvCell, serializeDisciplinaryReportCsv } from "./report-csv.ts";

const SEM_2026_1 = "11111111-1111-4111-8111-111111111111";
const SEM_2025_2 = "22222222-2222-4222-8222-222222222222";
const SEM_2025_1 = "33333333-3333-4333-8333-333333333333";
const SEM_2024_1 = "44444444-4444-4444-8444-444444444444";
const SEM_DEV_SEED = "ae2fa3de-7aa6-4a10-ad86-d7c6d5a8fe34";

const SEMESTERS = [
  {
    id: SEM_2026_1,
    academic_year_start: 2026,
    term: "1st Semester",
    starts_on: "2026-08-10",
    ends_on: "2026-12-18",
    is_current: true,
  },
  {
    id: SEM_2025_2,
    academic_year_start: 2025,
    term: "2nd Semester",
    starts_on: "2026-01-12",
    ends_on: "2026-05-22",
    is_current: false,
  },
  {
    id: SEM_2025_1,
    academic_year_start: 2025,
    term: "1st Semester",
    starts_on: "2025-08-11",
    ends_on: "2025-12-19",
    is_current: false,
  },
  {
    id: SEM_2024_1,
    academic_year_start: 2024,
    term: "1st Semester",
    starts_on: "2024-08-12",
    ends_on: "2024-12-20",
    is_current: false,
  },
  {
    id: SEM_DEV_SEED,
    academic_year_start: 2099,
    term: "Development Seed",
    starts_on: "2099-01-01",
    ends_on: "2099-06-01",
    is_current: false,
  },
];

const ENROLLMENTS = [
  { semester_id: SEM_2026_1, year_level: 3, academic_status: "regular" },
  { semester_id: SEM_2025_2, year_level: 2, academic_status: "regular" },
  { semester_id: SEM_2025_1, year_level: 2, academic_status: "irregular" },
];

test("formatAcademicYearLabel and formatReportTermLabel format display labels consistently", () => {
  assert.equal(formatAcademicYearLabel(2025), "AY 2025\u20132026");
  assert.equal(
    formatReportTermLabel({ term: "1st Semester", academic_year_start: 2026 }),
    "1st Semester \u00b7 AY 2026\u20132027"
  );
});

test("parseReportRouteParams validates page query parameters and rejects malformed inputs", () => {
  assert.deepEqual(parseReportRouteParams({ report: "semester" }), {
    scope: "semester",
    academicYearStart: null,
  });
  assert.deepEqual(parseReportRouteParams({ report: ["semester"] }), {
    scope: "semester",
    academicYearStart: null,
  });
  assert.deepEqual(parseReportRouteParams({ report: "year" }), {
    scope: "year",
    academicYearStart: null,
  });
  assert.deepEqual(parseReportRouteParams({ report: "year", year: "2025" }), {
    scope: "year",
    academicYearStart: 2025,
  });

  assert.equal(parseReportRouteParams({}), null);
  assert.equal(parseReportRouteParams({ report: "quarter" }), null);
  assert.equal(parseReportRouteParams({ report: ["semester", "year"] }), null);
  assert.equal(parseReportRouteParams({ report: "semester", year: "2025" }), null);
  assert.equal(parseReportRouteParams({ report: "year", year: "25" }), null);
  assert.equal(parseReportRouteParams({ report: "year", year: "2025a" }), null);
  assert.equal(parseReportRouteParams({ report: "year", year: "1899" }), null);
  assert.equal(parseReportRouteParams({ report: "year", year: "9999" }), null);
  assert.equal(parseReportRouteParams({ report: "year", year: ["2025", "2026"] }), null);
});

test("parseReportCsvParams strictly validates CSV route query parameters", () => {
  assert.deepEqual(
    parseReportCsvParams(new URLSearchParams(`scope=semester&semester=${SEM_2026_1}`)),
    { scope: "semester", semesterId: SEM_2026_1 }
  );
  assert.deepEqual(
    parseReportCsvParams(new URLSearchParams("scope=year&year=2025")),
    { scope: "year", academicYearStart: 2025 }
  );

  assert.equal(parseReportCsvParams(new URLSearchParams("")), null);
  assert.equal(parseReportCsvParams(new URLSearchParams("scope=semester")), null);
  assert.equal(parseReportCsvParams(new URLSearchParams("scope=semester&semester=not-a-uuid")), null);
  assert.equal(
    parseReportCsvParams(new URLSearchParams(`scope=semester&semester=${SEM_2026_1}&year=2026`)),
    null
  );
  assert.equal(
    parseReportCsvParams(new URLSearchParams(`scope=year&year=2025&semester=${SEM_2025_1}`)),
    null
  );
  assert.equal(
    parseReportCsvParams(new URLSearchParams("scope=year&scope=year&year=2025")),
    null
  );
  assert.equal(parseReportCsvParams(new URLSearchParams("scope=year&year=1899")), null);
  assert.equal(parseReportCsvParams(new URLSearchParams("scope=year&year=9999")), null);
});

test("deriveStudentAcademicYears excludes non-enrolled years, keeps enrolled Development Seed, and includes record semesters", () => {
  const standard = deriveStudentAcademicYears({
    semesters: SEMESTERS,
    enrollments: ENROLLMENTS,
  });
  assert.deepEqual(standard, [
    { academicYearStart: 2026, label: "AY 2026\u20132027", termCount: 1 },
    { academicYearStart: 2025, label: "AY 2025\u20132026", termCount: 2 },
  ]);

  const withHistoricalRecord = deriveStudentAcademicYears({
    semesters: SEMESTERS,
    enrollments: ENROLLMENTS,
    recordSemesterIds: [SEM_2024_1],
  });
  assert.deepEqual(
    withHistoricalRecord.map((y) => y.academicYearStart),
    [2026, 2025, 2024]
  );

  const devSeedEnrolled = deriveStudentAcademicYears({
    semesters: SEMESTERS,
    enrollments: [{ semester_id: SEM_DEV_SEED, year_level: 1, academic_status: "regular" }],
  });
  assert.deepEqual(devSeedEnrolled, [
    { academicYearStart: 2099, label: "AY 2099\u20132100", termCount: 1 },
  ]);
});

test("resolveReportPeriod resolves semester and academic-year scopes and rejects unavailable periods", () => {
  assert.equal(
    resolveReportPeriod({
      scope: "semester",
      requestedSemesterId: SEM_2026_1,
      semesters: SEMESTERS,
      enrollments: [],
    }),
    null
  );

  const semResult = resolveReportPeriod({
    scope: "semester",
    requestedSemesterId: SEM_2025_1,
    semesters: SEMESTERS,
    enrollments: ENROLLMENTS,
  });
  assert.ok(semResult);
  assert.equal(semResult.periodLabel, "1st Semester \u00b7 AY 2025\u20132026");
  assert.equal(semResult.academicYearStart, 2025);
  assert.deepEqual([...semResult.includedSemesterIds], [SEM_2025_1]);
  assert.equal(semResult.coveredTerms[0].yearLevel, 2);
  assert.equal(semResult.coveredTerms[0].academicStatus, "irregular");

  // Rejects a semester in which the student was never enrolled and has no records
  assert.equal(
    resolveReportPeriod({
      scope: "semester",
      requestedSemesterId: SEM_2024_1,
      semesters: SEMESTERS,
      enrollments: ENROLLMENTS,
    }),
    null
  );

  // Academic year defaults to the selected semester's academic_year_start when year is omitted
  const defaultYearResult = resolveReportPeriod({
    scope: "year",
    requestedSemesterId: SEM_2025_2,
    requestedAcademicYearStart: null,
    semesters: SEMESTERS,
    enrollments: ENROLLMENTS,
  });
  assert.ok(defaultYearResult);
  assert.equal(defaultYearResult.academicYearStart, 2025);
  assert.equal(defaultYearResult.periodLabel, "AY 2025\u20132026");
  assert.deepEqual([...defaultYearResult.includedSemesterIds], [SEM_2025_2, SEM_2025_1]);
  assert.equal(defaultYearResult.coveredTerms.length, 2);

  // Rejects an academic year where the student was never enrolled
  assert.equal(
    resolveReportPeriod({
      scope: "year",
      requestedSemesterId: SEM_2026_1,
      requestedAcademicYearStart: 2024,
      semesters: SEMESTERS,
      enrollments: ENROLLMENTS,
    }),
    null
  );
});

test("summarizePeriodActivity isolates period counts while calculateDisciplinarySummary computes cumulative standing", () => {
  // 2026-11-28T16:30:00Z is 2026-11-29 00:30 in Asia/Manila
  const todayManila = getTodayManila(new Date("2026-11-28T16:30:00.000Z"));
  assert.equal(todayManila, "2026-11-29");

  const cumulativeSummary = calculateDisciplinarySummary({
    demerits: [
      { bucket: "office", waived_at: null },
      { bucket: "office", waived_at: "2025-10-02T03:00:00Z" },
      { bucket: "rle", waived_at: null },
      { bucket: "rle", waived_at: null },
    ],
    merits: [
      { id: "m1", awarded_on: "2025-09-01", expires_on: "2026-09-01" }, // applied (takes precedence over expiry)
      { id: "m2", awarded_on: "2026-09-15", expires_on: "2027-09-15" }, // available
      { id: "m3", awarded_on: "2025-11-29", expires_on: "2026-11-29" }, // expired as of 2026-11-29 Manila
    ],
    applications: [{ merit_id: "m1", bucket: "rle" }],
    serviceCredits: [
      { bucket: "office", revoked_at: null },
      { bucket: "rle", revoked_at: "2026-10-10T01:00:00Z" },
    ],
    asOfDate: todayManila,
  });

  assert.equal(cumulativeSummary.office.balance, 0);
  assert.equal(cumulativeSummary.rle.balance, 1);
  assert.equal(cumulativeSummary.merits.available, 1);
  assert.equal(cumulativeSummary.merits.totalApplied, 1);
  assert.equal(cumulativeSummary.merits.expired, 1);

  const periodSummary = summarizePeriodActivity({
    demerits: [
      { bucket: "rle", status: "active" },
      { bucket: "office", status: "waived" },
    ],
    merits: [
      { status: "available" },
      { status: "applied" },
    ],
    serviceCredits: [
      { status: "active" },
      { status: "revoked" },
    ],
  });

  assert.deepEqual(periodSummary, {
    demeritsRecorded: 2,
    demeritsActive: 1,
    demeritsWaived: 1,
    officeDemeritsActive: 0,
    rleDemeritsActive: 1,
    meritsAwarded: 2,
    meritsAvailable: 1,
    meritsApplied: 1,
    meritsExpired: 0,
    serviceCreditsEarned: 2,
    serviceCreditsActive: 1,
    serviceCreditsRevoked: 1,
  });
});

test("actor/source label helpers mask Council officers and format External CI and Faculty entries", () => {
  assert.equal(
    formatDemeritIssuerLabel({
      source: "council",
      externalSourceName: null,
      issuerName: "Jane Student Officer",
    }),
    "Council"
  );
  assert.equal(
    formatDemeritWaivedByLabel({
      source: "council",
      waivedAt: "2026-11-10T04:00:00Z",
      waivedByName: "John President",
    }),
    "Council"
  );
  assert.equal(
    formatDemeritWaivedByLabel({
      source: "faculty",
      waivedAt: null,
      waivedByName: "Prof. Santos",
    }),
    null
  );
  assert.equal(
    formatDemeritIssuerLabel({
      source: "external_ci",
      externalSourceName: "  St. Luke's Medical Center  ",
      issuerName: "Prof. Reyes",
    }),
    "External: St. Luke's Medical Center"
  );
  assert.equal(
    formatMeritAwarderLabel({
      source: "endorsement",
      externalSourceName: null,
      awarderName: "Prof. Maria Clara",
    }),
    "Prof. Maria Clara"
  );
  assert.equal(
    formatMeritAwarderLabel({
      source: "endorsement",
      externalSourceName: null,
      awarderName: null,
    }),
    "Council Endorsement"
  );
  assert.equal(
    formatMeritAwarderLabel({
      source: "external_ci",
      externalSourceName: "Philippine Heart Center",
      awarderName: "Prof. Reyes",
    }),
    "External: Philippine Heart Center"
  );
});

test("buildReportFilename emits strictly sanitized ASCII filenames", () => {
  assert.equal(
    buildReportFilename({
      scope: "semester",
      universityId: "25-1-00123",
      academicYearStart: 2026,
      term: "1st Semester",
    }),
    "florence-disciplinary-report-25-1-00123-ay2026-2027-1st-semester.csv"
  );
  assert.equal(
    buildReportFilename({
      scope: "year",
      universityId: "25-1-00123\r\n\"evil/path\"",
      academicYearStart: 2025,
    }),
    "florence-disciplinary-report-25-1-00123-evil-path-ay2025-2026.csv"
  );
  assert.equal(
    buildReportFilename({
      scope: "year",
      universityId: null,
      academicYearStart: 2025,
    }),
    "florence-disciplinary-report-student-ay2025-2026.csv"
  );
});

test("escapeCsvCell neutralizes formula triggers (including leading whitespace) and applies RFC-4180 quoting", () => {
  assert.equal(escapeCsvCell(null), "");
  assert.equal(escapeCsvCell(undefined), "");
  assert.equal(escapeCsvCell(0), "0");
  assert.equal(escapeCsvCell("Plain text"), "Plain text");

  // Direct formula triggers
  assert.equal(escapeCsvCell("=SUM(A1:A2)"), "'=SUM(A1:A2)");
  assert.equal(escapeCsvCell("+cmd|' /C calc'!A0"), "'+cmd|' /C calc'!A0");
  assert.equal(escapeCsvCell("-1+1"), "'-1+1");
  assert.equal(escapeCsvCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(escapeCsvCell("@IMPORTXML(A1,B1)"), `"'@IMPORTXML(A1,B1)"`);
  assert.equal(escapeCsvCell("\t=1+1"), "'\t=1+1");
  assert.equal(escapeCsvCell("\r=1+1"), `"'\r=1+1"`);

  // Leading-whitespace formula triggers
  assert.equal(escapeCsvCell("   =HYPERLINK(\"http://evil\")"), `"'   =HYPERLINK(""http://evil"")"`);
  assert.equal(escapeCsvCell(" \n +1+1"), `"' \n +1+1"`);
  assert.equal(escapeCsvCell("  @SUM(1,2)"), `"'  @SUM(1,2)"`);

  // RFC-4180 commas, quotes, newlines, and edge spaces
  assert.equal(escapeCsvCell("Last, First"), `"Last, First"`);
  assert.equal(escapeCsvCell('Note with "quotes"'), `"Note with ""quotes"""`);
  assert.equal(escapeCsvCell("Line 1\nLine 2"), `"Line 1\nLine 2"`);
  assert.equal(escapeCsvCell("  padded  "), `"  padded  "`);
});

test("serializeDisciplinaryReportCsv includes UTF-8 BOM, CRLF, Council masking, formula escaping, and empty states", () => {
  const baseReport = {
    scope: "year",
    periodLabel: "AY 2025\u20132026",
    academicYearStart: 2025,
    generatedAt: "2026-11-28T09:00:00.000Z",
    asOfDateManila: "2026-11-28",
    student: {
      fullName: "Maria Santos, Jr.",
      universityId: "25-1-00123",
    },
    coveredTerms: [
      {
        term: "2nd Semester",
        academicYearStart: 2025,
        startsOn: "2026-01-12",
        endsOn: "2026-05-22",
        isCurrent: false,
        yearLevel: 2,
        academicStatus: "regular",
      },
      {
        term: "1st Semester",
        academicYearStart: 2025,
        startsOn: "2025-08-11",
        endsOn: "2025-12-19",
        isCurrent: false,
        yearLevel: 2,
        academicStatus: "irregular",
      },
    ],
    availableAcademicYears: [{ academicYearStart: 2025, label: "AY 2025\u20132026", termCount: 2 }],
    cumulativeSummary: {
      office: {
        bucket: "office",
        totalDemerits: 2,
        waivedDemerits: 1,
        activeDemerits: 1,
        appliedMerits: 0,
        activeServiceCredits: 0,
        revokedServiceCredits: 0,
        balance: 1,
      },
      rle: {
        bucket: "rle",
        totalDemerits: 1,
        waivedDemerits: 0,
        activeDemerits: 1,
        appliedMerits: 1,
        activeServiceCredits: 0,
        revokedServiceCredits: 0,
        balance: 0,
      },
      merits: {
        totalAwarded: 2,
        totalApplied: 1,
        available: 1,
        expired: 0,
      },
      totalActiveDemerits: 2,
      totalActiveBalance: 1,
      hasOutstandingDebt: true,
    },
    periodSummary: {
      demeritsRecorded: 2,
      demeritsActive: 1,
      demeritsWaived: 1,
      officeDemeritsActive: 1,
      rleDemeritsActive: 0,
      meritsAwarded: 1,
      meritsAvailable: 0,
      meritsApplied: 1,
      meritsExpired: 0,
      serviceCreditsEarned: 1,
      serviceCreditsActive: 0,
      serviceCreditsRevoked: 1,
    },
    demerits: [
      {
        id: "d1",
        incident_on: "2026-02-14",
        bucket: "office",
        source: "council",
        misconduct_label: null,
        description: "  =Event absence: General Assembly",
        consequence_outcome: "absence",
        source_unit_index: 1,
        incident_unit_index: 1,
        group_unit_count: 1,
        term_label: "2nd Semester \u00b7 AY 2025\u20132026",
        status: "waived",
        waived_at: "2026-02-15T02:00:00.000Z",
        waiver_reason: 'Approved "excuse" letter',
        issuer_label: "Council",
        waived_by_label: "Council",
      },
    ],
    merits: [
      {
        id: "m1",
        awarded_on: "2025-10-10",
        expires_on: "2026-10-10",
        source: "external_ci",
        description: "Blood donation drive, Ward B",
        term_label: "1st Semester \u00b7 AY 2025\u20132026",
        status: "applied",
        applied_bucket: "rle",
        applied_at: "2025-11-01T06:30:00.000Z",
        awarder_label: "External: Philippine Red Cross",
      },
    ],
    serviceCredits: [
      {
        id: "c1",
        issued_at: "2026-03-01T08:00:00.000Z",
        bucket: "office",
        term_label: "2nd Semester \u00b7 AY 2025\u20132026",
        status: "revoked",
        revoked_at: "2026-03-02T01:15:00.000Z",
        revocation_reason: "-Duplicate duty entry",
        supervisor_label: "Prof. Elena Cruz",
      },
    ],
  };

  const csv = serializeDisciplinaryReportCsv(baseReport, {
    formatDate: formatManilaDate,
    formatDateTime: formatManilaDateTime,
  });

  assert.equal(csv.startsWith("\uFEFF"), true);
  assert.equal(csv.endsWith("\r\n"), true);
  assert.ok(csv.includes('"Maria Santos, Jr."'));
  assert.ok(csv.includes("Informational record only. Not an official certified document."));
  // Leading-space formula neutralized with leading apostrophe
  assert.ok(csv.includes(`'  =Event absence: General Assembly`));
  // Embedded quotes doubled
  assert.ok(csv.includes(`"Approved ""excuse"" letter"`));
  // Leading hyphen formula neutralized
  assert.ok(csv.includes(`'-Duplicate duty entry`));
  // Council masking & External CI preserved, row IDs absent
  assert.ok(csv.includes(",Council,"));
  assert.ok(csv.includes("External: Philippine Red Cross"));
  assert.equal(csv.includes(",d1,"), false);
  assert.equal(csv.includes(",m1,"), false);
  assert.equal(csv.includes(",c1,"), false);

  const emptyCsv = serializeDisciplinaryReportCsv(
    {
      ...baseReport,
      demerits: [],
      merits: [],
      serviceCredits: [],
    },
    {
      formatDate: formatManilaDate,
      formatDateTime: formatManilaDateTime,
    }
  );
  assert.ok(emptyCsv.includes("No demerit records in this period."));
  assert.ok(emptyCsv.includes("No merit awards in this period."));
  assert.ok(emptyCsv.includes("No service duty credits in this period."));
});
