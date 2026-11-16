import assert from "node:assert/strict";
import { test } from "node:test";

import { activityEntries, attendeeSummary, byPriority, canGenerate, consequenceTotals, eventPhase, sameTotals } from "./event-state.ts";

const event = {
  audience_frozen_at: "2026-11-20T00:00:00Z", archived_at: null, attendance_locked_at: null,
  ends_at: "2026-11-20T04:00:00Z", time_in_until: "2026-11-20T04:00:00Z",
  time_out_from: null, time_out_until: null,
};

test("generation opens only after every window closes, for published unlocked events", () => {
  assert.equal(canGenerate(event, Date.parse("2026-11-20T03:59:00Z")), false);
  assert.equal(canGenerate(event, Date.parse("2026-11-20T04:00:00Z")), true);
  assert.equal(canGenerate({ ...event, time_out_until: "2026-11-20T05:00:00Z" }, Date.parse("2026-11-20T04:30:00Z")), false);
  assert.equal(canGenerate({ ...event, attendance_locked_at: "2026-11-20T06:00:00Z" }, Date.parse("2026-11-21T00:00:00Z")), false);
  assert.equal(canGenerate({ ...event, archived_at: "2026-11-20T06:00:00Z" }, Date.parse("2026-11-21T00:00:00Z")), false);
});

test("consequence totals count outcomes, fines and demerit days without float drift", () => {
  const totals = consequenceTotals([
    { outcome: "absence", fine_amount: 50.1, demerit_days: 2 },
    { outcome: "late", fine_amount: 20.2, demerit_days: 1 },
    { outcome: "late", fine_amount: null, demerit_days: 1 },
    { outcome: null, fine_amount: null, demerit_days: 0 },
  ]);
  assert.deepEqual(totals, { absent: 1, late: 2, fines: 2, fineTotal: 70.3, demeritDays: 4 });
  assert.equal(sameTotals(totals, { ...totals }), true);
  assert.equal(sameTotals(totals, { ...totals, late: 1 }), false);
});

test("events sort open, upcoming, waiting, draft, done; finished ones newest first", () => {
  const at = (day, extra = {}) => ({ ...event, starts_at: `2026-11-${day}T00:00:00Z`, time_in_from: `2026-11-${day}T00:00:00Z`,
    ends_at: `2026-11-${day}T04:00:00Z`, time_in_until: `2026-11-${day}T04:00:00Z`, name: `${day}`, ...extra });
  const now = Date.parse("2026-11-20T01:00:00Z");
  const list = [
    at("10", { attendance_locked_at: "x" }), at("15", { attendance_locked_at: "x" }), at("25", { audience_frozen_at: null }),
    at("12"), at("18"), at("28"), at("22"), at("20"),
  ];
  assert.deepEqual(list.sort(byPriority(now)).map((e) => e.name), ["20", "22", "28", "18", "12", "25", "15", "10"]);
});

test("event phase follows publication, windows, generation and archiving", () => {
  const published = { ...event, time_in_from: "2026-11-20T00:00:00Z" };
  assert.equal(eventPhase({ ...published, audience_frozen_at: null }, 0), "draft");
  assert.equal(eventPhase(published, Date.parse("2026-11-19T23:00:00Z")), "upcoming");
  assert.equal(eventPhase(published, Date.parse("2026-11-20T01:00:00Z")), "open");
  assert.equal(eventPhase(published, Date.parse("2026-11-20T04:00:00Z")), "closed");
  assert.equal(eventPhase({ ...published, attendance_locked_at: "2026-11-20T05:00:00Z" }, 0), "generated");
  assert.equal(eventPhase({ ...published, archived_at: "2026-11-20T05:00:00Z", attendance_locked_at: "x" }, 0), "archived");
});

const attendee = (id, status, timeIn, timeOut) => ({ student_id: id, first_name: "A", last_name: id, university_id: `99-1-0000${id}`,
  status, time_in: timeIn, time_out: timeOut, time_in_method: timeIn && "qr", time_out_method: timeOut && "manual",
  time_in_recorded_by: timeIn && "Rep, A", time_out_recorded_by: timeOut && "Rep, B" });

test("attendee summary counts statuses and recorded sides", () => {
  const rows = [attendee("1", "on_time", "2026-11-20T00:05:00Z", "2026-11-20T03:00:00Z"),
    attendee("2", "late", "2026-11-20T00:30:00Z", null), attendee("3", "not_in", null, null)];
  assert.deepEqual(attendeeSummary(rows), { participants: 3, timedIn: 2, timedOut: 1,
    not_in: 1, on_time: 1, late: 1, absent: 0, missing_time_out: 0 });
});

test("activity lists each recorded side newest first", () => {
  const entries = activityEntries([attendee("1", "on_time", "2026-11-20T00:05:00Z", "2026-11-20T03:00:00Z"),
    attendee("2", "late", "2026-11-20T00:30:00Z", null), attendee("3", "not_in", null, null)]);
  assert.deepEqual(entries.map((e) => [e.key, e.method, e.recordedBy]),
    [["1:out", "manual", "Rep, B"], ["2:in", "qr", "Rep, A"], ["1:in", "qr", "Rep, A"]]);
});
