import "server-only";

import { createUserClient } from "@/server/db/user-client";
import type { AttendanceSummary, EventDTO, EventRulesDTO } from "./contracts";

const eventFields =
  "id, semester_id, name, venue, starts_at, ends_at, time_in_from, time_in_until, time_out_from, time_out_until, late_after_minutes, year_levels, academic_statuses, audience_frozen_at, attendance_locked_at, archived_at";

/** Events in one semester; RLS limits rows to Council or preserved participants. */
export async function getEvents(semesterId: string): Promise<EventDTO[]> {
  const client = await createUserClient();
  const { data, error } = await client.from("events").select(eventFields)
    .eq("semester_id", semesterId).order("starts_at", { ascending: true });
  if (error) throw new Error(`Failed to fetch events: ${error.message}`);
  return data ?? [];
}

/** Rules for the given events. RLS returns nothing to Representatives. */
export async function getEventRules(eventIds: string[]): Promise<EventRulesDTO[]> {
  if (eventIds.length === 0) return [];
  const client = await createUserClient();
  const { data, error } = await client.from("event_consequence_rules")
    .select("event_id, absence_fine_definition_id, late_fine_definition_id, absence_demerit_days, late_demerit_days, absence_fine_amount, late_fine_amount, requires_time_out")
    .in("event_id", eventIds);
  if (error) throw new Error(`Failed to fetch event rules: ${error.message}`);
  return data ?? [];
}

export async function getAttendanceSummary(eventId: string): Promise<AttendanceSummary> {
  const client = await createUserClient();
  const count = async (column?: "time_in" | "time_out") => {
    let query = client.from("event_attendance").select("id", { count: "exact", head: true }).eq("event_id", eventId);
    if (column) query = query.not(column, "is", null);
    const { count: total, error } = await query;
    if (error) throw new Error(`Failed to count attendance: ${error.message}`);
    return total ?? 0;
  };
  const [participants, timedIn, timedOut] = await Promise.all([count(), count("time_in"), count("time_out")]);
  return { participants, timedIn, timedOut };
}
