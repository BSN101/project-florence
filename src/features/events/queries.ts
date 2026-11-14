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

/** Participant and timed-in counts per event for the list view, grouped in SQL under attendance RLS. */
export async function getAttendanceCounts(eventIds: string[]): Promise<Record<string, EventCounts>> {
  if (eventIds.length === 0) return {};
  const client = await createUserClient();
  const { data, error } = await client.rpc("florence_event_attendance_counts", { p_events: eventIds });
  if (error) throw new Error(`Failed to count attendance: ${error.message}`);
  return Object.fromEntries(data.map((row) => [row.event_id, { participants: row.participants, timedIn: row.timed_in }]));
}

/** The signed-in student's events in a semester (florence_my_events). */
export async function getMyEvents(semesterId: string): Promise<MyEventRow[]> {
  const client = await createUserClient();
  const { data, error } = await client.rpc("florence_my_events", { p_semester: semesterId });
  if (error) throw new Error(`Failed to fetch your events: ${error.message}`);
  return data;
}

/** All of the student's own submitted answers, keyed by event (one per event). */
export async function getMyFeedback(studentId: string): Promise<Record<string, FeedbackResponses>> {
  const client = await createUserClient();
  // RLS also lets Council read every row, so a Council member viewing as a student needs this filter.
  const { data, error } = await client.from("event_feedback").select("event_id, responses").eq("student_id", studentId);
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
