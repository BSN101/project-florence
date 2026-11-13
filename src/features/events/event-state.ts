import type { AttendeeRow, AttendeeStatus, ConsequencePreviewRow, ConsequenceTotals, EventDTO } from "./contracts";

/** Capture needs a published, unarchived event whose attendance is not yet locked. */
export function canCapture(event: EventDTO) {
  return event.audience_frozen_at !== null && event.archived_at === null && event.attendance_locked_at === null;
}

/** When capture ends: the latest of the event end and both windows. */
export function closesAt(event: Pick<EventDTO, "ends_at" | "time_in_until" | "time_out_until">) {
  return Math.max(...[event.ends_at, event.time_in_until, event.time_out_until]
    .filter((value): value is string => value !== null).map(Date.parse));
}

/** Generation opens once the event and both capture windows have closed (the database rechecks). */
export function canGenerate(event: EventDTO, now: number) {
  return canCapture(event) && now >= closesAt(event);
}

export type EventPhase = "draft" | "upcoming" | "open" | "closed" | "generated" | "archived";

export function eventPhase(event: EventDTO, now: number): EventPhase {
  if (event.archived_at) return "archived";
  if (event.attendance_locked_at) return "generated";
  if (!event.audience_frozen_at) return "draft";
  if (event.time_in_from && now < Date.parse(event.time_in_from)) return "upcoming";
  return now < closesAt(event) ? "open" : "closed";
}

export type AttendeeSummary = Record<AttendeeStatus, number> & { participants: number; timedIn: number; timedOut: number };

export function attendeeSummary(rows: Pick<AttendeeRow, "status" | "time_in" | "time_out">[]): AttendeeSummary {
  const summary: AttendeeSummary = { participants: rows.length, timedIn: 0, timedOut: 0,
    not_in: 0, on_time: 0, late: 0, absent: 0, missing_time_out: 0 };
  for (const row of rows) {
    if (row.time_in) summary.timedIn += 1;
    if (row.time_out) summary.timedOut += 1;
    summary[row.status as AttendeeStatus] += 1;
  }
  return summary;
}

export type ActivityEntry = { key: string; at: string; kind: "time_in" | "time_out"; student: string;
  universityId: string; method: string | null; recordedBy: string | null };

/** One entry per recorded side, newest first. */
export function activityEntries(rows: AttendeeRow[]): ActivityEntry[] {
  const entries: ActivityEntry[] = [];
  for (const row of rows) {
    const student = `${row.last_name}, ${row.first_name}`;
    if (row.time_in) entries.push({ key: `${row.student_id}:in`, at: row.time_in, kind: "time_in", student,
      universityId: row.university_id, method: row.time_in_method, recordedBy: row.time_in_recorded_by });
    if (row.time_out) entries.push({ key: `${row.student_id}:out`, at: row.time_out, kind: "time_out", student,
      universityId: row.university_id, method: row.time_out_method, recordedBy: row.time_out_recorded_by });
  }
  return entries.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

export function consequenceTotals(rows: Pick<ConsequencePreviewRow, "outcome" | "fine_amount" | "demerit_days">[]): ConsequenceTotals {
  const totals: ConsequenceTotals = { absent: 0, late: 0, fines: 0, fineTotal: 0, demeritDays: 0 };
  for (const row of rows) {
    if (row.outcome === "absence") totals.absent += 1;
    if (row.outcome === "late") totals.late += 1;
    if (row.fine_amount !== null) {
      totals.fines += 1;
      // Centavos avoid float drift when comparing totals before generation.
      totals.fineTotal = (Math.round(totals.fineTotal * 100) + Math.round(Number(row.fine_amount) * 100)) / 100;
    }
    totals.demeritDays += row.demerit_days;
  }
  return totals;
}

export function sameTotals(a: ConsequenceTotals, b: ConsequenceTotals) {
  return a.absent === b.absent && a.late === b.late && a.fines === b.fines
    && a.fineTotal === b.fineTotal && a.demeritDays === b.demeritDays;
}
