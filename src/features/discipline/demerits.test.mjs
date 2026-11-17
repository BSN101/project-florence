import assert from "node:assert/strict";
import test from "node:test";

import { instructorBucket } from "./calculations.ts";
import { logFacultyDemeritsSchema, demeritDaysSchema } from "./schemas.ts";

const KEY_1 = "11111111-1111-4111-8111-111111111111";
const KEY_2 = "44444444-4444-4444-8444-444444444444";
const STUDENT_1 = "22222222-2222-4222-8222-222222222222";
const STUDENT_2 = "33333333-3333-4333-8333-333333333333";
const MISCONDUCT_ID = "55555555-5555-4555-8555-555555555555";

const valid = {
  recipients: [
    { studentId: STUDENT_1, requestKey: KEY_1 },
    { studentId: STUDENT_2, requestKey: KEY_2 },
  ],
  days: 2,
  misconductId: MISCONDUCT_ID,
  isOther: false,
  incidentOn: "2026-11-16",
  notes: "",
};

const parse = (patch) => logFacultyDemeritsSchema.safeParse({ ...valid, ...patch });

// --- demeritDaysSchema -------------------------------------------------

test("demeritDaysSchema accepts whole positive integers and coerces strings", () => {
  assert.equal(demeritDaysSchema.safeParse(1).success, true);
  assert.equal(demeritDaysSchema.safeParse(50).success, true);
  const coerced = demeritDaysSchema.safeParse("3");
  assert.equal(coerced.success && coerced.data, 3);
  // FL-033 sets no upper bound on whole days.
  assert.equal(demeritDaysSchema.safeParse(100).success, true);
});

test("demeritDaysSchema rejects non-whole or non-positive values", () => {
  for (const days of [0, -1, 1.5, "", "abc"]) {
    assert.equal(demeritDaysSchema.safeParse(days).success, false, `days=${days}`);
  }
});

// --- logFacultyDemeritsSchema (composite) ------------------------------

test("logFacultyDemeritsSchema accepts a valid standard-catalog demerit with empty notes", () => {
  const result = parse({});
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.days, 2);
    assert.equal(result.data.notes, "");
  }
});

test("logFacultyDemeritsSchema accepts a standard-catalog demerit with optional notes", () => {
  const result = parse({ notes: "  Additional context about the incident  " });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.notes, "Additional context about the incident");
  }
});

test("logFacultyDemeritsSchema accepts Other when notes are provided", () => {
  const result = parse({ isOther: true, notes: "Student violated dress code policy." });
  assert.equal(result.success, true);
});

test("logFacultyDemeritsSchema rejects Other when notes are empty or too short", () => {
  assert.equal(parse({ isOther: true, notes: "" }).success, false);
  assert.equal(parse({ isOther: true, notes: "  " }).success, false);
  assert.equal(parse({ isOther: true, notes: "ab" }).success, false);
});

test("logFacultyDemeritsSchema rejects notes exceeding 500 characters", () => {
  assert.equal(parse({ notes: "x".repeat(501) }).success, false);
});

test("logFacultyDemeritsSchema rejects empty, duplicate or malformed recipients", () => {
  assert.equal(parse({ recipients: [] }).success, false);
  assert.equal(
    parse({
      recipients: [
        { studentId: STUDENT_1, requestKey: KEY_1 },
        { studentId: STUDENT_1, requestKey: KEY_2 },
      ],
    }).success,
    false
  );
  assert.equal(
    parse({ recipients: [{ studentId: "not-a-uuid", requestKey: KEY_1 }] }).success,
    false
  );
  assert.equal(
    parse({ recipients: [{ studentId: STUDENT_1, requestKey: "not-a-uuid" }] }).success,
    false
  );
});

test("logFacultyDemeritsSchema rejects malformed dates", () => {
  for (const incidentOn of ["16-11-2026", "invalid-date", "2026-02-30"]) {
    assert.equal(parse({ incidentOn }).success, false, incidentOn);
  }
});

test("logFacultyDemeritsSchema rejects invalid misconduct UUIDs", () => {
  assert.equal(parse({ misconductId: "not-a-uuid" }).success, false);
  assert.equal(parse({ misconductId: "" }).success, false);
});

test("logFacultyDemeritsSchema coerces string days", () => {
  const result = parse({ days: "5" });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.days, 5);
});

test("instructorBucket maps the instructor role to its bucket", () => {
  assert.equal(instructorBucket(["Academic Instructor", "Academic Coordinator"]), "office");
  assert.equal(instructorBucket(["Clinical Instructor", "RLE Coordinator"]), "rle");
  assert.equal(instructorBucket(["Platform Admin"]), null);
});
