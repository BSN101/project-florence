"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { AccessDeniedError, requireWorkspace } from "@/server/auth/require-workspace";
import { createCommandClient } from "@/server/db/command-client";
import { createUserClient } from "@/server/db/user-client";

import type { EventActionResult, ParticipantResult } from "./contracts";
import {
  eventIdSchema,
  participantSearchSchema,
  recordAttendanceSchema,
  saveEventSchema,
  type ParticipantSearchInput,
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
      // Capture stays open from time-in opening until the event ends, so late arrivals and
      // time-outs can be recorded live; generation decides late/absent from the times.
      p_time_in_until: d.endsAt,
      p_time_out_from: d.timeInFrom,
      p_time_out_until: d.endsAt,
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
