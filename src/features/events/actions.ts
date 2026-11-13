"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { AccessDeniedError, requireWorkspace } from "@/server/auth/require-workspace";
import { createCommandClient } from "@/server/db/command-client";
import { createUserClient } from "@/server/db/user-client";

import { mergeImportFindings, parseAttendanceCsv, type ImportRowResult } from "./attendance-import";
import type { EventActionResult, ParticipantResult } from "./contracts";
import {
  attendanceImportSchema,
  eventIdSchema,
  participantSearchSchema,
  qrAttendanceSchema,
  recordAttendanceSchema,
  saveEventSchema,
  type AttendanceImportInput,
  type ParticipantSearchInput,
  type QrAttendanceInput,
  type RecordAttendanceInput,
  type SaveEventInput,
} from "./schemas";

const path = "/council/events";

/** Event management is Executive/Operations only; Representatives only capture. */
async function requireEventManager() {
  const context = await requireWorkspace("council");
  if (context.councilRole !== "executive" && context.councilRole !== "operations") {
    throw new AccessDeniedError("forbidden");
  }
  return context;
}

function failure(err: unknown): { success: false; error: string } {
  if (err instanceof AccessDeniedError) return { success: false, error: "You are not permitted to do this." };
  return { success: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
}

export async function saveEvent(input: SaveEventInput): Promise<EventActionResult> {
  try {
    const context = await requireEventManager();
    const parsed = saveEventSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Check the highlighted event fields", issues: parsed.error.flatten().fieldErrors };
    }
    const d = parsed.data;
    // Generated RPC args are non-null; save_event accepts SQL NULL for these optional fields.
    const nullable = (value: string | null) => value as string;
    const { error } = await createCommandClient().rpc("save_event", {
      p_actor: context.profile.id,
      p_event: nullable(d.id),
      p_semester: d.semesterId,
      p_name: d.name,
      p_venue: nullable(d.venue),
      p_starts_at: d.startsAt,
      p_ends_at: d.endsAt,
      p_time_in_from: d.timeInFrom,
      // Both windows close at the event end so late arrivals can be recorded live; time-out
      // opens later to stop early exits. No time-out opening means no time-out recording.
      p_time_in_until: d.endsAt,
      p_time_out_from: nullable(d.timeOutFrom),
      p_time_out_until: nullable(d.timeOutFrom && d.endsAt),
      p_late_after_minutes: d.lateAfterMinutes,
      p_year_levels: d.yearLevels,
      p_academic_statuses: d.academicStatuses,
      p_absence_fine: nullable(d.absenceFineId),
      p_late_fine: nullable(d.lateFineId),
      p_absence_demerit_days: d.absenceDemeritDays,
      p_late_demerit_days: d.lateDemeritDays,
      p_requires_time_out: d.requiresTimeOut,
    });
    if (error) return { success: false, error: error.message };
    revalidatePath(path);
    return { success: true, message: d.id ? "Event updated" : "Event created" };
  } catch (err) {
    return failure(err);
  }
}

/** Freezes audience, windows and rules, and snapshots participants. */
export async function publishEvent(input: { eventId: string }): Promise<EventActionResult> {
  try {
    const context = await requireEventManager();
    const parsed = eventIdSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid event" };
    const { data, error } = await createCommandClient().rpc("freeze_event", {
      p_key: randomUUID(),
      p_actor: context.profile.id,
      p_event: parsed.data.eventId,
    });
    if (error) return { success: false, error: error.message };
    revalidatePath(path);
    const count = (data as { participant_count?: number } | null)?.participant_count ?? 0;
    return { success: true, message: `Event published with ${count} participant${count === 1 ? "" : "s"}` };
  } catch (err) {
    return failure(err);
  }
}

/** Archiving hides the event from future lists; attendance and consequences remain. */
export async function archiveEvent(input: { eventId: string }): Promise<EventActionResult> {
  try {
    await requireEventManager();
    const parsed = eventIdSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid event" };
    const now = new Date().toISOString();
    const { data, error } = await createCommandClient().from("events")
      .update({ archived_at: now, updated_at: now })
      .eq("id", parsed.data.eventId).is("archived_at", null).select("id");
    if (error) return { success: false, error: error.message };
    if (!data?.length) return { success: false, error: "Event not found or already archived" };
    revalidatePath(path);
    return { success: true, message: "Event archived" };
  } catch (err) {
    return failure(err);
  }
}

/** Restricted participant lookup for any Council role, including Representatives. */
export async function searchParticipants(
  input: ParticipantSearchInput,
): Promise<{ success: true; results: ParticipantResult[] } | { success: false; error: string }> {
  try {
    await requireWorkspace("council");
    const parsed = participantSearchSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid search" };
    const client = await createUserClient();
    const { data: matches, error } = await client.rpc("florence_attendance_lookup", {
      p_event: parsed.data.eventId, p_query: parsed.data.query, p_limit: 20,
    });
    if (error) return { success: false, error: error.message };
    if (!matches?.length) return { success: true, results: [] };
    const { data: rows, error: rowsError } = await client.from("event_attendance")
      .select("student_id, time_in, time_out").eq("event_id", parsed.data.eventId)
      .in("student_id", matches.map((m) => m.student_id));
    if (rowsError) return { success: false, error: rowsError.message };
    const byStudent = new Map(rows.map((row) => [row.student_id, row]));
    return {
      success: true,
      results: matches.map((m) => ({
        ...m,
        time_in: byStudent.get(m.student_id)?.time_in ?? null,
        time_out: byStudent.get(m.student_id)?.time_out ?? null,
      })),
    };
  } catch (err) {
    return failure(err);
  }
}

/** Manual capture at the database clock; the actor is always the session profile. */
export async function recordAttendance(input: RecordAttendanceInput): Promise<EventActionResult> {
  try {
    const context = await requireWorkspace("council");
    const parsed = recordAttendanceSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: "Invalid attendance request" };
    if (parsed.data.studentId === context.profile.id) {
      return { success: false, error: "You cannot record your own attendance." };
    }
    const { error } = await createCommandClient().rpc("record_event_attendance", {
      p_key: parsed.data.requestKey,
      p_actor: context.profile.id,
      p_event: parsed.data.eventId,
      p_student: parsed.data.studentId,
      p_kind: parsed.data.kind,
    });
    if (error) return { success: false, error: error.message };
    revalidatePath(path);
    return { success: true, message: parsed.data.kind === "time_in" ? "Time-in recorded" : "Time-out recorded" };
  } catch (err) {
    return failure(err);
  }
}

/** QR capture: the scanned university number is resolved to the student inside the database. */
export async function recordAttendanceByQr(input: QrAttendanceInput): Promise<EventActionResult> {
  try {
    const context = await requireWorkspace("council");
    const parsed = qrAttendanceSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid scan" };
    if (parsed.data.universityId === context.profile.university_id) {
      return { success: false, error: "You cannot record your own attendance." };
    }
    const { data, error } = await createCommandClient().rpc("record_event_attendance_qr", {
      p_key: parsed.data.requestKey,
      p_actor: context.profile.id,
      p_event: parsed.data.eventId,
      p_university_id: parsed.data.universityId,
      p_kind: parsed.data.kind,
    });
    if (error) return { success: false, error: `${parsed.data.universityId}: ${error.message}` };
    revalidatePath(path);
    const { first_name, last_name } = data as { first_name: string; last_name: string };
    const side = parsed.data.kind === "time_in" ? "Time-in" : "Time-out";
    return { success: true, message: `${side} recorded for ${last_name}, ${first_name} (${parsed.data.universityId})` };
  } catch (err) {
    return failure(err);
  }
}

export type AttendanceImportPreview = {
  ready: number;
  skipped: number;
  invalid: number;
  rows: ImportRowResult[];
};

/** Parses the paper-fallback CSV; the event start supplies the Manila date for time-only values. */
async function parseImport(input: AttendanceImportInput) {
  const parsed = attendanceImportSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid import" } as const;
  const { data: event, error } = await createCommandClient().from("events")
    .select("starts_at, time_in_from, time_in_until, time_out_from, time_out_until")
    .eq("id", parsed.data.eventId).maybeSingle();
  if (error || !event) return { error: "Event not found" } as const;
  const csv = parseAttendanceCsv(parsed.data.csv, event);
  if ("error" in csv) return { error: csv.error } as const;
  return { ...csv, input: parsed.data } as const;
}

/** Validates without writing. Any Council role may import (FL-017). */
export async function previewAttendanceImport(
  input: AttendanceImportInput,
): Promise<{ success: true; preview: AttendanceImportPreview } | { success: false; error: string }> {
  try {
    const context = await requireWorkspace("council");
    const parsed = await parseImport(input);
    if (!("rows" in parsed)) return { success: false, error: parsed.error };
    let checked: AttendanceImportPreview = { ready: 0, skipped: 0, invalid: 0, rows: [] };
    if (parsed.rows.length) {
      const { data, error } = await createCommandClient().rpc("import_event_attendance", {
        p_key: randomUUID(), p_actor: context.profile.id, p_event: parsed.input.eventId,
        p_rows: parsed.rows, p_apply: false,
      });
      if (error) return { success: false, error: error.message };
      checked = data as AttendanceImportPreview;
      // Tell apart numbers unknown to Florence from real students outside this event's audience.
      const unmatched = checked.rows.filter((row) => row.message === "Not a participant of this event");
      if (unmatched.length) {
        const { data: known, error: knownError } = await createCommandClient().from("profiles")
          .select("university_id").in("university_id", unmatched.map((row) => row.university_id));
        if (knownError) return { success: false, error: knownError.message };
        const existing = new Set(known.map((profile) => profile.university_id));
        for (const row of unmatched) {
          if (!existing.has(row.university_id)) row.message = "No student has this university number";
        }
      }
    }
    const rows = mergeImportFindings(checked.rows, parsed.invalid);
    const count = (status: ImportRowResult["status"]) => rows.filter((row) => row.status === status).length;
    return {
      success: true,
      preview: { ready: count("ready"), skipped: count("skipped"), invalid: count("invalid"), rows },
    };
  } catch (err) {
    return failure(err);
  }
}

/** All-or-nothing apply; the request key makes retries return the first result. */
export async function importAttendance(input: AttendanceImportInput): Promise<EventActionResult> {
  try {
    const context = await requireWorkspace("council");
    const parsed = await parseImport(input);
    if (!("rows" in parsed)) return { success: false, error: parsed.error };
    if (!parsed.input.requestKey) return { success: false, error: "Invalid import request" };
    if (parsed.invalid.length) return { success: false, error: "Fix the invalid rows before importing" };
    const { data, error } = await createCommandClient().rpc("import_event_attendance", {
      p_key: parsed.input.requestKey, p_actor: context.profile.id, p_event: parsed.input.eventId,
      p_rows: parsed.rows, p_apply: true,
    });
    if (error) return { success: false, error: error.message };
    revalidatePath(path);
    const { recorded, skipped } = data as { recorded: number; skipped: number };
    return { success: true, message: `Imported ${recorded} row${recorded === 1 ? "" : "s"}; ${skipped} skipped` };
  } catch (err) {
    return failure(err);
  }
}
