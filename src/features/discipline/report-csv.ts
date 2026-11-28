import type {
  ReportCoveredTerm,
  StudentDisciplinaryReportData,
  StudentDisciplinaryReportDemeritRow,
} from "./report-contracts";

const FORMULA_TRIGGER_REGEX = /^[\s\u0085\u2028\u2029]*[=+\-@\t\r]/;
const CSV_SPECIAL_CHAR_REGEX = /[",\r\n]/;

const formatDays = (count: number) => `${count} ${count === 1 ? "day" : "days"}`;

function formatBucketLabel(bucket: "office" | "rle"): string {
  return bucket === "office" ? "Office" : "RLE";
}

function formatDemeritSourceLabel(source: "faculty" | "council" | "external_ci"): string {
  if (source === "council") return "Council";
  if (source === "external_ci") return "External CI";
  return "Faculty";
}

function formatMeritSourceLabel(source: "direct" | "endorsement" | "external_ci"): string {
  if (source === "endorsement") return "Endorsement";
  if (source === "external_ci") return "External CI";
  return "Direct";
}

function formatMeritStatusLabel(status: "available" | "applied" | "expired"): string {
  if (status === "applied") return "Applied";
  if (status === "expired") return "Expired";
  return "Available";
}

function formatDemeritUnitLabel(demerit: StudentDisciplinaryReportDemeritRow): string {
  if (demerit.source === "council") {
    return `Unit #${demerit.source_unit_index ?? demerit.incident_unit_index}`;
  }
  if (demerit.group_unit_count > 1) {
    return `Unit ${demerit.incident_unit_index} of ${demerit.group_unit_count}`;
  }
  return "1 day";
}

function formatCoveredTermsSummary(
  terms: readonly ReportCoveredTerm[],
  formatDate: (value: string | null | undefined) => string
): string {
  if (terms.length === 0) return "—";
  return terms
    .map((t) => `${t.term} (${formatDate(t.startsOn)} \u2013 ${formatDate(t.endsOn)})`)
    .join("; ");
}

function formatEnrollmentContextSummary(terms: readonly ReportCoveredTerm[]): string {
  const enrolled = terms.filter((t) => t.yearLevel !== null && t.academicStatus !== null);
  if (enrolled.length === 0) return "No enrollment record in selected period";
  return enrolled
    .map((t) => {
      const statusLabel = t.academicStatus === "irregular" ? "Irregular" : "Regular";
      return `${t.term}: Year ${t.yearLevel} (${statusLabel})`;
    })
    .join("; ");
}

/**
 * Neutralizes spreadsheet formula prefixes (including after leading whitespace) with a leading
 * apostrophe before applying RFC-4180 double-quote escaping.
 */
export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  if (raw.length === 0) return "";

  const safe = FORMULA_TRIGGER_REGEX.test(raw) ? `'${raw}` : raw;
  const hasEdgeWhitespace = safe !== safe.trim();

  if (CSV_SPECIAL_CHAR_REGEX.test(safe) || hasEdgeWhitespace) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function serializeCsvRow(cells: readonly (string | number | null | undefined)[]): string {
  if (cells.length === 0) return "";
  return cells.map(escapeCsvCell).join(",");
}

/**
 * Serializes a student's disciplinary report into an Excel-compatible UTF-8 BOM CSV document
 * with CRLF line endings, formula-injection protection, and zero internal UUIDs.
 */
export function serializeDisciplinaryReportCsv(
  report: StudentDisciplinaryReportData,
  formatters: {
    formatDate: (value: string | null | undefined) => string;
    formatDateTime: (value: string | null | undefined) => string;
  }
): string {
  const { formatDate, formatDateTime } = formatters;
  const { office, rle, merits } = report.cumulativeSummary;
  const { periodSummary } = report;

  const rows: (string | number | null | undefined)[][] = [
    ["Project Florence \u2014 Student Disciplinary Report"],
    ["Student Name", report.student.fullName],
    ["University Number", report.student.universityId],
    ["Report Scope", report.scope === "year" ? "Academic Year" : "Single Semester"],
    ["Period", report.periodLabel],
    ["Covered Terms", formatCoveredTermsSummary(report.coveredTerms, formatDate)],
    ["Enrollment Context", formatEnrollmentContextSummary(report.coveredTerms)],
    ["Generated (Asia/Manila)", formatDateTime(report.generatedAt)],
    ["Notice", "Informational record only. Not an official certified document."],
    [],
    ["Current Cumulative Standing (All Semesters)"],
    [
      "Category",
      "Active Demerits",
      "Waived Demerits",
      "Applied Merits",
      "Active Service Credits",
      "Revoked Service Credits",
      "Current Balance / Available",
    ],
    [
      "Office Duty",
      office.activeDemerits,
      office.waivedDemerits,
      office.appliedMerits,
      office.activeServiceCredits,
      office.revokedServiceCredits,
      formatDays(Math.max(0, office.balance)),
    ],
    [
      "Clinical (RLE) Duty",
      rle.activeDemerits,
      rle.waivedDemerits,
      rle.appliedMerits,
      rle.activeServiceCredits,
      rle.revokedServiceCredits,
      formatDays(Math.max(0, rle.balance)),
    ],
    [
      "Available Merits",
      `${merits.totalAwarded} awarded`,
      `${merits.expired} expired`,
      `${merits.totalApplied} applied`,
      "—",
      "—",
      formatDays(merits.available),
    ],
    [],
    ["Period Activity Summary", report.periodLabel],
    ["Demerits Recorded", periodSummary.demeritsRecorded],
    ["Active Demerits", periodSummary.demeritsActive],
    ["Waived Demerits", periodSummary.demeritsWaived],
    ["Merits Awarded", periodSummary.meritsAwarded],
    ["Service Credits Earned", periodSummary.serviceCreditsEarned],
    ["Active Service Credits", periodSummary.serviceCreditsActive],
    ["Revoked Service Credits", periodSummary.serviceCreditsRevoked],
    [],
    ["Demerits in Period"],
    [
      "Term",
      "Incident Date",
      "Bucket",
      "Source",
      "Misconduct",
      "Description",
      "Unit",
      "Status",
      "Issuer / Source",
      "Waived Date",
      "Waived By",
      "Waiver Reason",
    ],
  ];

  if (report.demerits.length === 0) {
    rows.push(["No demerit records in this period."]);
  } else {
    for (const d of report.demerits) {
      const misconduct =
        d.misconduct_label ??
        (d.consequence_outcome ? `Event ${d.consequence_outcome}` : "—");
      rows.push([
        d.term_label,
        formatDate(d.incident_on),
        formatBucketLabel(d.bucket),
        formatDemeritSourceLabel(d.source),
        misconduct,
        d.description,
        formatDemeritUnitLabel(d),
        d.status === "waived" ? "Waived" : "Active",
        d.issuer_label,
        d.waived_at ? formatDateTime(d.waived_at) : "",
        d.waived_by_label ?? "",
        d.waiver_reason ?? "",
      ]);
    }
  }

  rows.push(
    [],
    ["Merits in Period"],
    [
      "Term",
      "Award Date",
      "Valid Until",
      "Source",
      "Description",
      "Status",
      "Applied Bucket",
      "Applied Date",
      "Awarded By / Source",
    ]
  );

  if (report.merits.length === 0) {
    rows.push(["No merit awards in this period."]);
  } else {
    for (const m of report.merits) {
      rows.push([
        m.term_label,
        formatDate(m.awarded_on),
        formatDate(m.expires_on),
        formatMeritSourceLabel(m.source),
        m.description,
        formatMeritStatusLabel(m.status),
        m.applied_bucket ? formatBucketLabel(m.applied_bucket) : "",
        m.applied_at ? formatDateTime(m.applied_at) : "",
        m.awarder_label,
      ]);
    }
  }

  rows.push(
    [],
    ["Service Credits in Period"],
    [
      "Term",
      "Issued Date",
      "Bucket",
      "Status",
      "Supervisor / Issuer",
      "Revoked Date",
      "Revocation Reason",
    ]
  );

  if (report.serviceCredits.length === 0) {
    rows.push(["No service duty credits in this period."]);
  } else {
    for (const c of report.serviceCredits) {
      rows.push([
        c.term_label,
        formatDateTime(c.issued_at),
        formatBucketLabel(c.bucket),
        c.status === "revoked" ? "Revoked" : "Active",
        c.supervisor_label,
        c.revoked_at ? formatDateTime(c.revoked_at) : "",
        c.revocation_reason ?? "",
      ]);
    }
  }

  return `\uFEFF${rows.map(serializeCsvRow).join("\r\n")}\r\n`;
}
