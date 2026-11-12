import assert from "node:assert/strict";
import { test } from "node:test";

import { isoToManilaInput, manilaInputToIso, recordAttendanceSchema, saveEventSchema } from "./schemas.ts";

const uuid = "11111111-1111-4111-8111-111111111111";
const valid = {
  id: null,
  semesterId: uuid,
  name: "  General Assembly ",
  venue: "",
  startsAt: "2026-11-20T00:00:00.000Z",
  endsAt: "2026-11-20T04:00:00.000Z",
  timeInFrom: "2026-11-19T23:30:00.000Z",
  lateAfterMinutes: "15",
  yearLevels: [1, 2],
  academicStatuses: ["regular"],
  absenceFineId: uuid,
  lateFineId: null,
  absenceDemeritDays: 1,
  lateDemeritDays: 0,
  requiresTimeOut: false,
};

test("accepts a valid event and normalizes text and numbers", () => {
  const result = saveEventSchema.safeParse(valid);
  assert.equal(result.success, true);
  assert.equal(result.data.name, "General Assembly");
  assert.equal(result.data.venue, null);
  assert.equal(result.data.lateAfterMinutes, 15);
});

test("rejects end before start and time-in opening at or after the end", () => {
  const result = saveEventSchema.safeParse({ ...valid, endsAt: valid.startsAt, timeInFrom: valid.startsAt });
  assert.equal(result.success, false);
  const paths = result.error.issues.map((issue) => issue.path[0]);
  assert.ok(paths.includes("endsAt"));
  assert.ok(paths.includes("timeInFrom"));
});

test("time-out requirement needs no separate window", () => {
  assert.equal(saveEventSchema.safeParse({ ...valid, requiresTimeOut: true }).success, true);
});

test("rejects empty audience, bad year levels and fractional demerits", () => {
  assert.equal(saveEventSchema.safeParse({ ...valid, yearLevels: [] }).success, false);
  assert.equal(saveEventSchema.safeParse({ ...valid, yearLevels: [5] }).success, false);
  assert.equal(saveEventSchema.safeParse({ ...valid, academicStatuses: [] }).success, false);
  assert.equal(saveEventSchema.safeParse({ ...valid, absenceDemeritDays: 1.5 }).success, false);
});

test("attendance capture accepts only time_in/time_out", () => {
  const base = { eventId: uuid, studentId: uuid, requestKey: uuid };
  assert.equal(recordAttendanceSchema.safeParse({ ...base, kind: "time_in" }).success, true);
  assert.equal(recordAttendanceSchema.safeParse({ ...base, kind: "late" }).success, false);
});

test("Manila local input round-trips through UTC", () => {
  assert.equal(manilaInputToIso("2026-11-20T08:00"), "2026-11-20T00:00:00.000Z");
  assert.equal(isoToManilaInput("2026-11-20T00:00:00.000Z"), "2026-11-20T08:00");
  assert.equal(manilaInputToIso(""), null);
});
