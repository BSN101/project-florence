import "server-only";

import { createUserClient } from "@/server/db/user-client";
import type { AttendanceSummary, AttendeeRow, EventCounts, EventDTO, EventRulesDTO, FeedbackRow, MyEventRow } from "./contracts";
import type { FeedbackResponses } from "./feedback";

const eventFields =
  "id, semester_id, name, venue, starts_at, ends_at, time_in_from, time_in_until, time_out_from, time_out_until, late_after_minutes, year_levels, academic_statuses, audience_frozen_at, attendance_locked_at, archived_at, consequence_bucket";

/** Events in one semester; RLS limits rows to Council or preserved participants. */
export async function getEvents(semesterId: string): Promise<EventDTO[]> {
  const client = await createUserClient();
  const { data, error } = await client.from("events").select(eventFields)
    .eq("semester_id", semesterId).order("starts_at", { ascending: true });
  if (error) throw new Error(`Failed to fetch events: ${error.message}`);
  return data ?? [];
}

/** One event by id; RLS applies as in getEvents. */
export async function getEvent(eventId: string): Promise<EventDTO | null> {
  const client = await createUserClient();
  const { data, error } = await client.from("events").select(eventFields).eq("id", eventId).maybeSingle();
  if (error) throw new Error(`Failed to fetch event: ${error.message}`);
  return data;
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

/** Attendee list with capture details; the function enforces who may see it. */
export async function getEventAttendance(eventId: string): Promise<AttendeeRow[]> {
  const client = await createUserClient();
  const { data, error } = await client.rpc("florence_event_attendance", { p_event: eventId });
  if (error) throw new Error(`Failed to fetch attendance: ${error.message}`);
  return data;
}

/** Participant and timed-in counts per event for the list view. */
// shortcut: fetches one thin row per participant and counts here; fine for a semester's
// events (thousands of rows), switch to a grouped SQL view if lists grow far beyond that.
export async function getAttendanceCounts(eventIds: string[]): Promise<Record<string, EventCounts>> {
  if (eventIds.length === 0) return {};
  const client = await createUserClient();
  const { data, error } = await client.from("event_attendance").select("event_id, time_in").in("event_id", eventIds);
  if (error) throw new Error(`Failed to count attendance: ${error.message}`);
  const counts: Record<string, EventCounts> = {};
  for (const row of data) {
    const c = (counts[row.event_id] ??= { participants: 0, timedIn: 0 });
    c.participants += 1;
    if (row.time_in) c.timedIn += 1;
  }
  return counts;
}

/** The signed-in student's events in a semester (florence_my_events). */
export async function getMyEvents(semesterId: string): Promise<MyEventRow[]> {
  const client = await createUserClient();
  const { data, error } = await client.rpc("florence_my_events", { p_semester: semesterId });
  if (error) throw new Error(`Failed to fetch your events: ${error.message}`);
  return data;
}

/** The student's own submitted answers for the given events (RLS: own rows only). */
export async function getMyFeedback(eventIds: string[]): Promise<Record<string, FeedbackResponses>> {
  if (eventIds.length === 0) return {};
  const client = await createUserClient();
  const { data, error } = await client.from("event_feedback").select("event_id, responses").in("event_id", eventIds);
  if (error) throw new Error(`Failed to fetch your feedback: ${error.message}`);
  return Object.fromEntries(data.map((row) => [row.event_id, row.responses as FeedbackResponses]));
}

/** Identified responses; the function refuses anyone but Executive/Operations. */
export async function getEventFeedback(eventId: string): Promise<FeedbackRow[]> {
  const client = await createUserClient();
  const { data, error } = await client.rpc("florence_event_feedback", { p_event: eventId });
  if (error) throw new Error(`Failed to fetch feedback: ${error.message}`);
  return data;
}
