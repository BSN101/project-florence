import type { Database } from "@/server/db/database.types";

type Tables = Database["public"]["Tables"];

/** Event fields visible to every Council role (no consequence rules). */
export type EventDTO = Pick<
  Tables["events"]["Row"],
  | "id" | "semester_id" | "name" | "venue" | "starts_at" | "ends_at"
  | "time_in_from" | "time_in_until" | "time_out_from" | "time_out_until"
  | "late_after_minutes" | "year_levels" | "academic_statuses"
  | "audience_frozen_at" | "attendance_locked_at" | "archived_at"
>;

/** Consequence configuration; Executive/Operations only (rules_read RLS). */
export type EventRulesDTO = Pick<
  Tables["event_consequence_rules"]["Row"],
  | "event_id" | "absence_fine_definition_id" | "late_fine_definition_id"
  | "absence_demerit_days" | "late_demerit_days" | "absence_fine_amount"
  | "late_fine_amount" | "requires_time_out"
>;

export type AttendanceSummary = { participants: number; timedIn: number; timedOut: number };

/** Minimal Representative-safe lookup projection plus this event's capture state. */
export type ParticipantResult =
  Database["public"]["Functions"]["florence_attendance_lookup"]["Returns"][number] &
  Pick<Tables["event_attendance"]["Row"], "time_in" | "time_out">;

export type EventActionResult =
  | { success: true; message?: string }
  | { success: false; error: string; issues?: Record<string, string[]> };
