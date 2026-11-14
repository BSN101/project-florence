import type {
  RosterImportPreview,
  RosterImportRowInput,
  RosterImportRowResult,
} from "./contracts";

// Fixed 8-column contract; inlined so node:test can load this file directly.
export const FIXED_CSV_ROSTER_HEADERS = [
  "university_id",
  "last_name",
  "first_name",
  "middle_name",
  "suffix",
  "email",
  "year_level",
  "academic_status",
] as const;

export const CSV_TEMPLATE_CONTENT = `university_id,last_name,first_name,middle_name,suffix,email,year_level,academic_status
26-1-00123,Dela Cruz,Juan Carlos,Santos,Jr.,juancarlos.delacruz@university.edu.ph,1,regular
26-1-00124,Reyes,Maria Teresa,Aquino,,mariateresa.reyes@university.edu.ph,2,irregular
`;

export const MAX_ROSTER_IMPORT_ROWS = 10000;

/** Optional last column written by the fix-up download; ignored on import. */
const ISSUE_COLUMN = "issue";

/**
 * RFC 4180-style CSV parsing: handles quotes, escaped quotes, CRLF/LF, optional BOM.
 * Each row keeps the file line it starts on, so skipped blank lines don't shift row numbers.
 * Throws on an unclosed quote instead of swallowing the rest of the file.
 */
export function parseCsv(text: string): { cells: string[]; line: number }[] {
  const rows: { cells: string[]; line: number }[] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let start = 1;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        if (char === "\n" || (char === "\r" && input[i + 1] !== "\n")) line++;
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push({ cells: row, line: start });
      row = [];
      field = "";
      start = ++line;
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error(`Unclosed quote in the row starting on line ${start}.`);
  if (field !== "" || row.length) {
    row.push(field);
    rows.push({ cells: row, line: start });
  }
  return rows.filter(({ cells }) => cells.some((cell) => cell.trim() !== ""));
}

/**
 * Parses the fixed 8-column student roster CSV.
 * Matches: university_id,last_name,first_name,middle_name,suffix,email,year_level,academic_status
 */
export function parseRosterCsv(text: string):
  | { error: string }
  | { rows: RosterImportRowInput[]; invalid: RosterImportRowResult[] } {
  let parsed: ReturnType<typeof parseCsv>;
  try {
    parsed = parseCsv(text);
  } catch (error) {
    return { error: (error as Error).message };
  }
  const [header, ...body] = parsed;
  if (!header) return { error: "The file is empty." };

  const columns = header.cells.map((cell) => cell.trim().toLowerCase());
  const unknown = columns.filter(
    (column) => column !== ISSUE_COLUMN && !(FIXED_CSV_ROSTER_HEADERS as readonly string[]).includes(column),
  );
  const missing = FIXED_CSV_ROSTER_HEADERS.filter((column) => !columns.includes(column));

  if (unknown.length || missing.length || new Set(columns).size !== columns.length) {
    return { error: `Headers must be ${FIXED_CSV_ROSTER_HEADERS.join(",")}.` };
  }

  if (body.length === 0) return { error: "The file has no student rows." };
  if (body.length > MAX_ROSTER_IMPORT_ROWS) {
    return { error: `The file has more than ${MAX_ROSTER_IMPORT_ROWS} rows.` };
  }

  const at = (cells: string[], column: string) => cells[columns.indexOf(column)]?.trim() ?? "";
  const rows: RosterImportRowInput[] = [];
  const invalid: RosterImportRowResult[] = [];

  body.forEach(({ cells, line: row }) => {
    const universityId = at(cells, "university_id");
    const lastName = at(cells, "last_name");
    const firstName = at(cells, "first_name");
    const middleNameRaw = at(cells, "middle_name");
    const suffixRaw = at(cells, "suffix");
    const emailRaw = at(cells, "email");
    const yearLevelRaw = at(cells, "year_level");
    const academicStatusRaw = at(cells, "academic_status").toLowerCase();

    const middleName = middleNameRaw.length > 0 ? middleNameRaw : null;
    const suffix = suffixRaw.length > 0 ? suffixRaw : null;
    const email = emailRaw.length > 0 ? emailRaw.toLowerCase() : null;
    // Blank stays null so validation can say "required"; only well-formed rows reach the database.
    const yearLevel = yearLevelRaw === "" ? null : Number(yearLevelRaw);

    const issues: string[] = [];
    // Empty trailing cells (spreadsheet exports, a deleted issue header) are harmless.
    if (cells.slice(columns.length).some((cell) => cell.trim() !== "")) {
      issues.push("Too many columns");
    }

    if (issues.length > 0) {
      invalid.push({
        row,
        university_id: universityId || `Row ${row}`,
        name: [firstName, lastName].filter(Boolean).join(" ") || "Unknown",
        action: "none",
        status: "invalid",
        message: issues.join("; "),
      });
    }

    rows.push({
      row,
      university_id: universityId,
      last_name: lastName,
      first_name: firstName,
      middle_name: middleName,
      suffix,
      email,
      year_level: yearLevel,
      academic_status: academicStatusRaw,
    });
  });

  return { rows, invalid };
}

/** Merges database RPC and client parser findings per row. */
export function mergeRosterImportFindings(
  dbPreview: RosterImportPreview,
  parserInvalid: RosterImportRowResult[],
): RosterImportPreview {
  if (!parserInvalid.length) return dbPreview;

  const parserMap = new Map(parserInvalid.map((p) => [p.row, p]));
  const mergedRows: RosterImportRowResult[] = dbPreview.rows.map((row) => {
    const parserFinding = parserMap.get(row.row);
    if (!parserFinding) return row;
    parserMap.delete(row.row);
    const messages = new Set([
      ...row.message.split("; "),
      ...parserFinding.message.split("; "),
    ]);
    return {
      ...row,
      status: "invalid",
      message: [...messages].filter(Boolean).join("; "),
    };
  });

  for (const remaining of parserMap.values()) {
    mergedRows.push(remaining);
  }

  mergedRows.sort((a, b) => a.row - b.row);

  const count = (match: (r: RosterImportRowResult) => boolean) => mergedRows.filter(match).length;
  const ready = (action: string) => count((r) => r.status === "ready" && r.action === action);

  return {
    ...dbPreview,
    ready: count((r) => r.status === "ready"),
    conflicts: count((r) => r.status === "conflict"),
    invalid: count((r) => r.status === "invalid"),
    // A parser finding can turn a ready row invalid, so the action counts must follow.
    created: ready("create"),
    re_enrolled: ready("re_enroll"),
    updated: ready("update"),
    rows: mergedRows,
  };
}

/**
 * The uploaded file rewritten for fixing and re-uploading: ready rows first, then rows that
 * need fixing, each with its problems in a trailing `issue` column the import ignores.
 * Cells keep what the officer typed; cells past the 8 columns stay at the end so
 * "Too many columns" is still visible.
 */
export function rosterFixCsv(csvText: string, results: RosterImportRowResult[]): string {
  const [header, ...body] = parseCsv(csvText); // this file already passed parsing on the server
  const columns = header.cells.map((cell) => cell.trim().toLowerCase());
  const byLine = new Map(results.map((r) => [r.row, r]));
  const needsFix = (line: number) => byLine.get(line)?.status !== "ready";
  const quote = (text: string) => (/[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);

  const rows = body
    .sort((a, b) => Number(needsFix(a.line)) - Number(needsFix(b.line)) || a.line - b.line)
    .map(({ cells, line }) => [
      ...FIXED_CSV_ROSTER_HEADERS.map((column) => cells[columns.indexOf(column)] ?? ""),
      needsFix(line) ? byLine.get(line)?.message ?? "" : "",
      ...cells.slice(columns.length),
    ]);
  return [[...FIXED_CSV_ROSTER_HEADERS, ISSUE_COLUMN], ...rows].map((r) => r.map(quote).join(",")).join("\r\n") + "\r\n";
}
