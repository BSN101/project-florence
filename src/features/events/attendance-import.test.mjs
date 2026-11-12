import assert from "node:assert/strict";
import { test } from "node:test";

import { manilaDate, mergeImportFindings, parseAttendanceCsv, parseClock, parseCsv } from "./attendance-import.ts";

test("parseCsv handles BOM, quotes, escaped quotes, CRLF and blank lines", () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n1,\n'), [
    ["a", "b"], ["x, y", 'say "hi"'], ["1", ""],
  ]);
});

test("Manila date crosses the UTC day boundary", () => {
  assert.equal(manilaDate("2026-11-12T22:13:00.000Z"), "2026-11-13");
});

test("parseClock accepts 24-hour and AM/PM times on the event date", () => {
  assert.equal(parseClock("08:05", "2026-11-13"), "2026-11-13T00:05:00.000Z");
  assert.equal(parseClock("8:05 PM", "2026-11-13"), "2026-11-13T12:05:00.000Z");
  assert.equal(parseClock("12:30 am", "2026-11-13"), "2026-11-12T16:30:00.000Z");
  assert.equal(parseClock("8:05:30", "2026-11-13"), "2026-11-13T00:05:30.000Z");
  assert.equal(parseClock("  ", "2026-11-13"), null);
  for (const bad of ["25:00", "8:60", "13:00 PM", "8.05", "noon"]) assert.equal(parseClock(bad, "2026-11-13"), undefined, bad);
});

// 08:00–12:00 Manila on 2026-11-13 for both sides, as derived for new events.
const event = {
  starts_at: "2026-11-13T00:00:00.000Z",
  time_in_from: "2026-11-13T00:00:00.000Z",
  time_in_until: "2026-11-13T04:00:00.000Z",
  time_out_from: "2026-11-13T00:00:00.000Z",
  time_out_until: "2026-11-13T04:00:00.000Z",
};

test("parseAttendanceCsv validates headers", () => {
  const starts = event;
  assert.ok("error" in parseAttendanceCsv("university_id,time_in\n", starts));
  assert.ok("error" in parseAttendanceCsv("university_id,time_in,time_out,extra\n", starts));
  assert.ok("error" in parseAttendanceCsv("university_id,time_in,time_out\n", starts));
});

test("parseAttendanceCsv lists format problems and still sends valid-id rows to the database", () => {
  const result = parseAttendanceCsv(
    "Time_Out,University_ID,time_in\n11:58,26-1-00123,08:05\n,bad-id,08:00\n,26-1-00125,8 AM\n,26-1-00126,\n11:00,26-1-00127,\n,26-1-00128,08:10\n",
    event,
  );
  assert.ok(!("error" in result));
  assert.deepEqual(result.invalid.map((r) => [r.row, r.message]), [
    [3, "University number must be XX-1-XXXXX"],
    [4, "Time-in must look like 08:05 or 8:05 AM"],
    [5, "Time-in and time-out are blank"],
    [6, "Time-out has no time-in"],
  ]);
  // Bad-id row 3 is not sent; others are, with unusable sides cleared.
  assert.deepEqual(result.rows.map((r) => [r.row, r.time_in, r.time_out]), [
    [2, "2026-11-13T00:05:00.000Z", "2026-11-13T03:58:00.000Z"],
    [4, null, null],
    [5, null, null],
    [6, null, "2026-11-13T03:00:00.000Z"],
    [7, "2026-11-13T00:10:00.000Z", null],
  ]);
});

test("parseAttendanceCsv flags times outside the event's window, reporting both sides", () => {
  const csv = ["university_id,time_in,time_out", "26-1-00001,07:59,11:00", "26-1-00002,08:30,12:01",
    "26-1-00003,7:00 AM,1:00 PM", "26-1-00004,08:00,12:00"].join("\n");
  const result = parseAttendanceCsv(csv, event);
  assert.deepEqual(result.invalid.map((r) => [r.row, r.message]), [
    [2, "Time-in must be between 8:00 AM and 12:00 PM"],
    [3, "Time-out must be between 8:00 AM and 12:00 PM"],
    [4, "Time-in must be between 8:00 AM and 12:00 PM; Time-out must be between 8:00 AM and 12:00 PM"],
  ]);
  // Out-of-window sides are cleared before the database check; boundaries are inclusive.
  assert.deepEqual(result.rows.map((r) => [r.row, r.time_in !== null, r.time_out !== null]),
    [[2, false, true], [3, true, false], [4, false, false], [5, true, true]]);
  const noTimeOut = parseAttendanceCsv("university_id,time_in,time_out\n26-1-00001,08:10,11:00",
    { ...event, time_out_from: null, time_out_until: null });
  assert.equal(noTimeOut.invalid[0].message, "This event has no time-out window");
});

test("parseAttendanceCsv lists every problem on one row", () => {
  const result = parseAttendanceCsv("university_id,time_in,time_out\n26-1-1,7:00 AM,9am,extra", event);
  assert.equal(result.invalid[0].message,
    "Too many columns; University number must be XX-1-XXXXX; Time-out must look like 08:05 or 8:05 AM; Time-in must be between 8:00 AM and 12:00 PM");
  const order = parseAttendanceCsv("university_id,time_in,time_out\n26-1-00001,10:00,09:00", event);
  assert.equal(order.invalid[0].message, "Time-out must be after time-in");
});

test("mergeImportFindings combines parser and database problems per row", () => {
  const r = (row, status, message, name = null) => ({ row, university_id: `26-1-0000${row}`, name, status, message });
  const merged = mergeImportFindings(
    [
      r(2, "invalid", "Not a participant of this event"),
      r(3, "skipped", "No times given", "Ana Santos"),
      r(4, "ready", "Time-in already recorded online; CSV value ignored", "Juan Cruz"),
      r(5, "invalid", "Time-out has no time-in"),
      r(6, "ready", null, "Maria Reyes"),
    ],
    [
      r(2, "invalid", "Time-in must be between 8:00 AM and 12:00 PM"),
      r(3, "invalid", "Time-in and time-out are blank"),
      r(4, "invalid", "Time-out must be between 8:00 AM and 12:00 PM"),
      r(5, "invalid", "Time-out has no time-in"),
      { row: 7, university_id: "bad", name: null, status: "invalid", message: "University number must be XX-1-XXXXX" },
    ],
  );
  assert.deepEqual(merged.map((m) => [m.row, m.status, m.message, m.name]), [
    [2, "invalid", "Time-in must be between 8:00 AM and 12:00 PM; Not a participant of this event", null],
    [3, "invalid", "Time-in and time-out are blank", "Ana Santos"],
    [4, "invalid", "Time-out must be between 8:00 AM and 12:00 PM; Time-in already recorded online; CSV value ignored", "Juan Cruz"],
    [5, "invalid", "Time-out has no time-in", null],
    [6, "ready", null, "Maria Reyes"],
    [7, "invalid", "University number must be XX-1-XXXXX", null],
  ]);
});
