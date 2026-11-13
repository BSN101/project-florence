import type {
  RosterImportPreview,
  RosterImportRowInput,
  RosterImportRowResult,
} from "./contracts";

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

/** RFC 4180-style CSV parsing: handles quotes, escaped quotes, CRLF/LF, optional BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
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
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

/**
 * Parses the fixed 8-column student roster CSV.
 * Matches: university_id,last_name,first_name,middle_name,suffix,email,year_level,academic_status
 */
export function parseRosterCsv(text: string):
  | { error: string }
  | { rows: RosterImportRowInput[]; invalid: RosterImportRowResult[] } {
  const [header, ...body] = parseCsv(text);
  if (!header) return { error: "The file is empty." };

  const columns = header.map((cell) => cell.trim().toLowerCase());
  const unknown = columns.filter(
    (column) => !(FIXED_CSV_ROSTER_HEADERS as readonly string[]).includes(column),
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

  body.forEach((cells, index) => {
    const row = index + 2; // spreadsheet 1-based line number (header is row 1)
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
    const yearLevelNum = Number(yearLevelRaw);
    const yearLevel = Number.isInteger(yearLevelNum) ? yearLevelNum : 0;

    const issues: string[] = [];
    if (cells.length > columns.length) {
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

  const ready = mergedRows.filter((r) => r.status === "ready").length;
  const conflicts = mergedRows.filter((r) => r.status === "conflict").length;
  const invalid = mergedRows.filter((r) => r.status === "invalid").length;

  return {
    ...dbPreview,
    ready,
    conflicts,
    invalid,
    rows: mergedRows,
  };
}
