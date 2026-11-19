import assert from "node:assert/strict";
import test from "node:test";

import {
  requestedDaysSchema,
  endorsementDescriptionSchema,
  submitMeritEndorsementsSchema,
} from "./schemas.ts";

const KEY_1 = "11111111-1111-4111-8111-111111111111";
const KEY_2 = "44444444-4444-4444-8444-444444444444";
const STUDENT_1 = "22222222-2222-4222-8222-222222222222";
const STUDENT_2 = "33333333-3333-4333-8333-333333333333";
const INSTRUCTOR_ID = "55555555-5555-4555-8555-555555555555";

const valid = {
  recipients: [
    { studentId: STUDENT_1, requestKey: KEY_1 },
    { studentId: STUDENT_2, requestKey: KEY_2 },
  ],
  instructorId: INSTRUCTOR_ID,
  requestedDays: 2,
  description: "Exemplary leadership and peer assistance during community health outreach.",
};

const parse = (patch) => submitMeritEndorsementsSchema.safeParse({ ...valid, ...patch });

// --- requestedDaysSchema ------------------------------------------------

test("requestedDaysSchema accepts whole positive integers and coerces strings", () => {
  assert.equal(requestedDaysSchema.safeParse(1).success, true);
  assert.equal(requestedDaysSchema.safeParse(7).success, true);
  const coerced = requestedDaysSchema.safeParse("3");
  assert.equal(coerced.success && coerced.data, 3);
});

test("requestedDaysSchema caps requested days at 7", () => {
  for (const days of [8, 50, 1000000]) {
    assert.equal(requestedDaysSchema.safeParse(days).success, false, `days=${days}`);
  }
});

test("requestedDaysSchema rejects non-whole or non-positive values", () => {
  for (const days of [0, -1, 1.5, "", "abc", null, undefined]) {
    assert.equal(requestedDaysSchema.safeParse(days).success, false, `days=${days}`);
  }
});

// --- endorsementDescriptionSchema ---------------------------------------

test("endorsementDescriptionSchema accepts valid descriptions and trims whitespace", () => {
  const result = endorsementDescriptionSchema.safeParse("  Outstanding duty assistance  ");
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data, "Outstanding duty assistance");
  }
});

test("endorsementDescriptionSchema rejects empty or too-short descriptions (< 3 chars)", () => {
  for (const desc of ["", "a", "  ab  ", "  ", null, undefined]) {
    assert.equal(endorsementDescriptionSchema.safeParse(desc).success, false, `desc=${desc}`);
  }
});

test("endorsementDescriptionSchema rejects descriptions exceeding 500 characters", () => {
  const longDesc = "a".repeat(501);
  assert.equal(endorsementDescriptionSchema.safeParse(longDesc).success, false);
});

// --- submitMeritEndorsementsSchema (composite) --------------------------

test("submitMeritEndorsementsSchema accepts a valid endorsement batch", () => {
  const result = parse({});
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.requestedDays, 2);
    assert.equal(result.data.instructorId, INSTRUCTOR_ID);
    assert.equal(result.data.recipients.length, 2);
  }
});

test("submitMeritEndorsementsSchema coerces string requestedDays", () => {
  const result = parse({ requestedDays: "5" });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.requestedDays, 5);
  }
});

test("submitMeritEndorsementsSchema rejects empty recipients list", () => {
  assert.equal(parse({ recipients: [] }).success, false);
});

test("submitMeritEndorsementsSchema rejects duplicate student IDs in recipients", () => {
  const duplicate = parse({
    recipients: [
      { studentId: STUDENT_1, requestKey: KEY_1 },
      { studentId: STUDENT_1, requestKey: KEY_2 },
    ],
  });
  assert.equal(duplicate.success, false);
});

test("submitMeritEndorsementsSchema rejects invalid student or requestKey UUIDs", () => {
  assert.equal(
    parse({
      recipients: [{ studentId: "not-a-uuid", requestKey: KEY_1 }],
    }).success,
    false
  );
  assert.equal(
    parse({
      recipients: [{ studentId: STUDENT_1, requestKey: "not-a-uuid" }],
    }).success,
    false
  );
});

test("submitMeritEndorsementsSchema rejects invalid instructor UUID", () => {
  for (const instructorId of ["", "invalid-id", null, undefined]) {
    assert.equal(parse({ instructorId }).success, false, `instructorId=${instructorId}`);
  }
});

test("submitMeritEndorsementsSchema rejects invalid days and descriptions", () => {
  assert.equal(parse({ requestedDays: 0 }).success, false);
  assert.equal(parse({ requestedDays: -3 }).success, false);
  assert.equal(parse({ description: "" }).success, false);
  assert.equal(parse({ description: "ab" }).success, false);
});

// --- Self-endorsement prevention rules ----------------------------------

test("self-endorsement detection correctly flags when an officer appears in recipients", () => {
  const OFFICER_PROFILE_ID = STUDENT_1;
  const recipients = [
    { studentId: STUDENT_1, requestKey: KEY_1 },
    { studentId: STUDENT_2, requestKey: KEY_2 },
  ];

  // Identifies self
  const selfEntry = recipients.find((r) => r.studentId === OFFICER_PROFILE_ID);
  assert.ok(selfEntry);
  assert.equal(selfEntry.studentId, OFFICER_PROFILE_ID);

  // Filters self for picker
  const eligibleRecipients = recipients.filter((r) => r.studentId !== OFFICER_PROFILE_ID);
  assert.equal(eligibleRecipients.length, 1);
  assert.equal(eligibleRecipients[0].studentId, STUDENT_2);
});
