// Same XX-1-XXXXX rule as studentNumberSchema; inlined so node:test can load this file.
const UNIVERSITY_ID = /^[0-9]{2}-1-[0-9]{5}$/;

export const ATTENDANCE_CSV_HEADERS = ["university_id", "time_in", "time_out"] as const;
export const MAX_IMPORT_ROWS = 10000;

export const ATTENDANCE_CSV_TEMPLATE = `university_id,time_in,time_out
26-1-00123,08:05,11:58
26-1-00124,8:21 AM,
`;

export type ImportRow = { row: number; university_id: string; time_in: string | null; time_out: string | null };
export type ImportRowResult = {
  row: number;
  university_id: string;
  name: string | null;
  status: "ready" | "skipped" | "invalid";
  message: string | null;
};

/** RFC 4180-style parsing: quoted fields, escaped quotes, CRLF/LF, optional BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += char;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

/** Manila calendar date (YYYY-MM-DD) of an instant; Asia/Manila is fixed UTC+08:00. */
export function manilaDate(iso: string) {
  return new Date(Date.parse(iso) + 8 * 3600_000).toISOString().slice(0, 10);
}

/** "8:05", "08:05:30", "8:05 PM" on the given Manila date -> ISO; "" -> null; otherwise undefined. */
export function parseClock(value: string, date: string): string | null | undefined {
  const text = value.trim();
  if (!text) return null;
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/.exec(text);
  if (!match) return undefined;
  let hours = Number(match[1]);
  const [minutes, seconds] = [Number(match[2]), Number(match[3] ?? 0)];
  const meridiem = match[4]?.toLowerCase();
  if (meridiem) {
    if (hours < 1 || hours > 12) return undefined;
    hours = (hours % 12) + (meridiem === "pm" ? 12 : 0);
  }
  if (hours > 23 || minutes > 59 || seconds > 59) return undefined;
  const pad = (n: number) => String(n).padStart(2, "0");
  return new Date(`${date}T${pad(hours)}:${pad(minutes)}:${pad(seconds)}+08:00`).toISOString();
}

export type ImportEventWindows = {
  starts_at: string;
  time_in_from: string | null;
  time_in_until: string | null;
  time_out_from: string | null;
  time_out_until: string | null;
};

const clockLabel = new Intl.DateTimeFormat("en-PH", { timeStyle: "short", timeZone: "Asia/Manila" });

/** Message when `iso` falls outside the stored window (opening..event end for new events). */
function outOfBounds(side: string, iso: string | null, from: string | null, until: string | null) {
  if (iso === null) return null;
  if (from === null || until === null) return `This event has no ${side} window`;
  const at = Date.parse(iso);
  return at < Date.parse(from) || at > Date.parse(until)
    ? `${side[0].toUpperCase()}${side.slice(1)} must be between ${clockLabel.format(new Date(from))} and ${clockLabel.format(new Date(until))}`
    : null;
}

/**
 * Parses the fixed attendance CSV and collects every format/window problem per row.
 * `invalid` lists rows with problems. `rows` holds every row with a well-formed university
 * number (flagged sides cleared) so the database can add participant/duplicate checks.
 */
export function parseAttendanceCsv(text: string, event: ImportEventWindows):
  | { error: string }
  | { rows: ImportRow[]; invalid: ImportRowResult[] } {
  const [header, ...body] = parseCsv(text);
  if (!header) return { error: "The file is empty." };
  const columns = header.map((cell) => cell.trim().toLowerCase());
  const unknown = columns.filter((column) => !(ATTENDANCE_CSV_HEADERS as readonly string[]).includes(column));
  const missing = ATTENDANCE_CSV_HEADERS.filter((column) => !columns.includes(column));
  if (unknown.length || missing.length || new Set(columns).size !== columns.length) {
    return { error: `Headers must be ${ATTENDANCE_CSV_HEADERS.join(",")}.` };
  }
  if (body.length === 0) return { error: "The file has no attendance rows." };
  if (body.length > MAX_IMPORT_ROWS) return { error: `The file has more than ${MAX_IMPORT_ROWS} rows.` };

  const date = manilaDate(event.starts_at);
  const at = (cells: string[], column: string) => cells[columns.indexOf(column)]?.trim() ?? "";
  const rows: ImportRow[] = [];
  const invalid: ImportRowResult[] = [];
  body.forEach((cells, index) => {
    const row = index + 2; // spreadsheet line number, after the header
    const universityId = at(cells, "university_id");
    const timeIn = parseClock(at(cells, "time_in"), date);
    const timeOut = parseClock(at(cells, "time_out"), date);
    const issues: string[] = [];
    if (cells.length > columns.length) issues.push("Too many columns");
    const idValid = UNIVERSITY_ID.test(universityId);
    if (!idValid) issues.push("University number must be XX-1-XXXXX");
    if (timeIn === undefined) issues.push("Time-in must look like 08:05 or 8:05 AM");
    if (timeOut === undefined) issues.push("Time-out must look like 08:05 or 8:05 AM");
    // Every CSV row needs a time-in, even when one was recorded online.
    if (timeIn === null) issues.push(timeOut ? "Time-out has no time-in" : "Time-in and time-out are blank");
    // Checked even for sides already recorded online, so every bad paper value is reported.
    const inIssue = outOfBounds("time-in", timeIn ?? null, event.time_in_from, event.time_in_until);
    const outIssue = outOfBounds("time-out", timeOut ?? null, event.time_out_from, event.time_out_until);
    if (inIssue) issues.push(inIssue);
    if (outIssue) issues.push(outIssue);
    if (timeIn && timeOut && Date.parse(timeOut) <= Date.parse(timeIn)) issues.push("Time-out must be after time-in");

    if (issues.length) invalid.push({ row, university_id: universityId, name: null, status: "invalid", message: issues.join("; ") });
    if (idValid) rows.push({
      row, university_id: universityId,
      time_in: timeIn && !inIssue ? timeIn : null,
      time_out: timeOut && !outIssue ? timeOut : null,
    });
  });
  return { rows, invalid };
}

/** Merges database and parser findings so each row lists all of its problems at once. */
export function mergeImportFindings(dbRows: ImportRowResult[], parserInvalid: ImportRowResult[]): ImportRowResult[] {
  const fromParser = new Map(parserInvalid.map((row) => [row.row, row]));
  const rows = dbRows.map((row): ImportRowResult => {
    const parsed = fromParser.get(row.row);
    fromParser.delete(row.row);
    if (!parsed) return row;
    // "No times given" only reflects sides the parser already cleared.
    const db = row.status === "invalid" || row.message !== "No times given" ? row.message : null;
    const messages = new Set([...(parsed.message ?? "").split("; "), ...(db ? db.split("; ") : [])]);
    return { ...row, status: "invalid", message: [...messages].filter(Boolean).join("; ") };
  });
  return [...rows, ...fromParser.values()].sort((a, b) => a.row - b.row);
}
