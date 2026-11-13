import assert from "node:assert/strict";
import { test } from "node:test";

import { isoToManilaInput, manilaInputToIso, qrAttendanceSchema, recordAttendanceSchema, saveEventSchema } from "./schemas.ts";

const uuid = "11111111-1111-4111-8111-111111111111";
const valid = {
  id: null,
  semesterId: uuid,
  name: "  General Assembly ",
  venue: "",
  // 2026-11-20, 08:00–12:00 Manila.
  timeInFrom: "2026-11-20T00:00:00.000Z",
  timeOutFrom: null,
  closesAt: "2026-11-20T04:00:00.000Z",
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

test("attendance must close after time-in opens, on the same Manila date", () => {
  const issues = (input) => saveEventSchema.safeParse(input).error?.issues.map((issue) => issue.path[0]) ?? [];
  assert.deepEqual(issues({ ...valid, closesAt: valid.timeInFrom }), ["closesAt"]);
  // 2026-11-21 00:30 Manila is the next day.
  assert.deepEqual(issues({ ...valid, closesAt: "2026-11-20T16:30:00.000Z" }), ["closesAt"]);
  // 23:30 Manila is still the event date.
  assert.deepEqual(issues({ ...valid, closesAt: "2026-11-20T15:30:00.000Z" }), []);
});

test("time-out opening is required only when time-out is required, and must sit before closing", () => {
  assert.equal(saveEventSchema.safeParse({ ...valid, requiresTimeOut: true }).success, false);
  assert.equal(saveEventSchema.safeParse({ ...valid, requiresTimeOut: true, timeOutFrom: "2026-11-20T03:30:00.000Z" }).success, true);
  assert.equal(saveEventSchema.safeParse({ ...valid, timeOutFrom: "2026-11-20T03:30:00.000Z" }).success, true);
  assert.equal(saveEventSchema.safeParse({ ...valid, timeOutFrom: "2026-11-19T23:00:00.000Z" }).success, false); // before time-in opens
  assert.equal(saveEventSchema.safeParse({ ...valid, timeOutFrom: valid.closesAt }).success, false); // at closing
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

test("QR attendance accepts only a trimmed university number payload", () => {
  const scan = (universityId) => qrAttendanceSchema.safeParse({ eventId: uuid, universityId, kind: "time_in", requestKey: uuid });
  assert.equal(scan(" 21-1-00001\n").data?.universityId, "21-1-00001");
  for (const bad of ["21-1-0001", "21-2-00001", "https://example.com/21-1-00001", '{"id":"21-1-00001"}', ""]) {
    assert.equal(scan(bad).success, false, bad);
  }
});
