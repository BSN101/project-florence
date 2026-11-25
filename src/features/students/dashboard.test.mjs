import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { findNextUpcomingEvent } from "./dashboard.ts";

describe("Task T-056 / FL-043: Student Dashboard Helpers", () => {
  const baseMockEvent = {
    event_id: "evt-001",
    name: "Nursing Orientation",
    venue: "Main Auditorium",
    status: "scheduled",
    time_in_from: "2026-11-25T08:00:00+08:00",
    time_in_until: "2026-11-25T09:00:00+08:00",
    time_out_from: "2026-11-25T11:00:00+08:00",
    time_out_until: "2026-11-25T12:00:00+08:00",
    late_after_minutes: 15,
    consequence_bucket: "office",
    demerit_days: 1,
    fine_amount: 50,
    fine_waived: false,
    attendance_locked_at: null,
    feedback_opens_at: "2026-11-25T12:00:00+08:00",
    feedback_closes_at: "2026-11-28T23:59:59+08:00",
    feedback_eligible: false,
    feedback_submitted_at: null,
    time_in: null,
    time_out: null,
  };

  test("returns null and 0 when events list is empty", () => {
    const result = findNextUpcomingEvent([], "2026-11-24T08:00:00+08:00");
    assert.deepEqual(result, { highlight: null, totalUpcoming: 0 });
  });

  test("returns null and 0 when all events are in the past and attendance is locked", () => {
    const pastEvent = {
      ...baseMockEvent,
      event_id: "evt-past",
      time_in_from: "2026-11-20T08:00:00+08:00",
      time_in_until: "2026-11-20T09:00:00+08:00",
      feedback_opens_at: "2026-11-20T12:00:00+08:00",
      attendance_locked_at: "2026-11-20T13:00:00+08:00",
    };

    const result = findNextUpcomingEvent([pastEvent], "2026-11-24T08:00:00+08:00");
    assert.deepEqual(result, { highlight: null, totalUpcoming: 0 });
  });

  test("identifies single upcoming event correctly", () => {
    const upcomingEvent = {
      ...baseMockEvent,
      event_id: "evt-future",
      time_in_from: "2026-11-26T08:00:00+08:00",
    };

    const result = findNextUpcomingEvent([upcomingEvent], "2026-11-24T08:00:00+08:00");
    assert.equal(result.totalUpcoming, 1);
    assert.equal(result.highlight?.isOngoing, false);
    assert.equal(result.highlight?.event.event_id, "evt-future");
  });

  test("sorts multiple upcoming events chronologically and picks earliest", () => {
    const eventLater = {
      ...baseMockEvent,
      event_id: "evt-later",
      time_in_from: "2026-11-30T08:00:00+08:00",
    };
    const eventEarlier = {
      ...baseMockEvent,
      event_id: "evt-earlier",
      time_in_from: "2026-11-26T08:00:00+08:00",
    };
    const eventMiddle = {
      ...baseMockEvent,
      event_id: "evt-middle",
      time_in_from: "2026-11-28T08:00:00+08:00",
    };

    // Pass in unsorted order
    const result = findNextUpcomingEvent(
      [eventLater, eventEarlier, eventMiddle],
      "2026-11-24T08:00:00+08:00"
    );

    assert.equal(result.totalUpcoming, 3);
    assert.equal(result.highlight?.isOngoing, false);
    assert.equal(result.highlight?.event.event_id, "evt-earlier");
  });

  test("prioritizes ongoing event over future upcoming event", () => {
    const ongoingEvent = {
      ...baseMockEvent,
      event_id: "evt-ongoing",
      time_in_from: "2026-11-24T07:30:00+08:00",
      time_in_until: "2026-11-24T08:30:00+08:00",
      feedback_opens_at: "2026-11-24T12:00:00+08:00",
      attendance_locked_at: null,
    };
    const futureEvent = {
      ...baseMockEvent,
      event_id: "evt-future",
      time_in_from: "2026-11-26T08:00:00+08:00",
    };

    const result = findNextUpcomingEvent(
      [futureEvent, ongoingEvent],
      "2026-11-24T08:00:00+08:00"
    );

    assert.equal(result.totalUpcoming, 2);
    assert.equal(result.highlight?.isOngoing, true);
    assert.equal(result.highlight?.event.event_id, "evt-ongoing");
  });

  test("handles invalid date gracefully", () => {
    const result = findNextUpcomingEvent([baseMockEvent], "invalid-date");
    assert.deepEqual(result, { highlight: null, totalUpcoming: 0 });
  });
});
