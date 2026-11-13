import type { Database } from "@/server/db/database.types";

type Tables = Database["public"]["Tables"];

/** Event fields visible to every Council role (no consequence rules). */
export type EventDTO = Pick<
  Tables["events"]["Row"],
  | "id" | "semester_id" | "name" | "venue" | "starts_at" | "ends_at"
  | "time_in_from" | "time_in_until" | "time_out_from" | "time_out_until"
  | "late_after_minutes" | "year_levels" | "academic_statuses"
  | "audience_frozen_at" | "attendance_locked_at" | "archived_at" | "consequence_bucket"
>;

/** Consequence configuration; Executive/Operations only (rules_read RLS). */
export type EventRulesDTO = Pick<
  Tables["event_consequence_rules"]["Row"],
  | "event_id" | "absence_fine_definition_id" | "late_fine_definition_id"
  | "absence_demerit_days" | "late_demerit_days" | "absence_fine_amount"
  | "late_fine_amount" | "requires_time_out"
>;

export type AttendanceSummary = { participants: number; timedIn: number; timedOut: number };

/** One participant's projected (or, after generation, generated) consequence. */
export type ConsequencePreviewRow =
  Database["public"]["Functions"]["florence_event_consequence_preview"]["Returns"][number];

/** Event attendee with capture details and live status (florence_event_attendance). */
export type AttendeeRow = Database["public"]["Functions"]["florence_event_attendance"]["Returns"][number];
export type AttendeeStatus = "not_in" | "on_time" | "late" | "absent" | "missing_time_out";

export type EventCounts = { participants: number; timedIn: number };

export type ConsequenceTotals = { absent: number; late: number; fines: number; fineTotal: number; demeritDays: number };

export type EventActionResult =
  | { success: true; message?: string }
  | { success: false; error: string; issues?: Record<string, string[]> };
