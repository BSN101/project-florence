import assert from "node:assert/strict";
import test from "node:test";

import { deriveStudentRequestKey, awardDirectMeritsSchema } from "./schemas.ts";

const VALID_SUBMISSION_KEY = "11111111-1111-4111-8111-111111111111";
const STUDENT_1 = "22222222-2222-4222-8222-222222222222";
const STUDENT_2 = "33333333-3333-4333-8333-333333333333";

test("deriveStudentRequestKey generates deterministic valid RFC-4122 UUIDs", () => {
  const key1 = deriveStudentRequestKey(VALID_SUBMISSION_KEY, STUDENT_1);
  const key2 = deriveStudentRequestKey(VALID_SUBMISSION_KEY, STUDENT_1);
  const keyStudent2 = deriveStudentRequestKey(VALID_SUBMISSION_KEY, STUDENT_2);
  const keyOtherSubmission = deriveStudentRequestKey(STUDENT_2, STUDENT_1);

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  assert.match(key1, uuidRegex, "Derived key must match RFC-4122 UUID format");
  assert.equal(key1, key2, "Same submission key and student id must derive identical key");
  assert.notEqual(key1, keyStudent2, "Different student id must derive different key");
  assert.notEqual(key1, keyOtherSubmission, "Different submission key must derive different key");
});

test("awardDirectMeritsSchema accepts valid merit award input", () => {
  const result = awardDirectMeritsSchema.safeParse({
    submissionKey: VALID_SUBMISSION_KEY,
    studentIds: [STUDENT_1, STUDENT_2],
    days: 3,
    awardedOn: "2026-11-16",
    description: "Voluntary clinical outreach assistance and student leadership.",
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.days, 3);
    assert.equal(result.data.studentIds.length, 2);
  }
});

test("awardDirectMeritsSchema coerces string days to whole number", () => {
  const result = awardDirectMeritsSchema.safeParse({
    submissionKey: VALID_SUBMISSION_KEY,
    studentIds: [STUDENT_1],
    days: "5",
    awardedOn: "2026-11-16",
    description: "Consistent clinical duty assistance.",
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.days, 5);
  }
});

test("awardDirectMeritsSchema rejects non-integer, zero, or negative days", () => {
  assert.equal(
    awardDirectMeritsSchema.safeParse({
      submissionKey: VALID_SUBMISSION_KEY,
      studentIds: [STUDENT_1],
      days: 0,
      awardedOn: "2026-11-16",
      description: "Valid description",
    }).success,
    false,
    "Zero days must be rejected"
  );

  assert.equal(
    awardDirectMeritsSchema.safeParse({
      submissionKey: VALID_SUBMISSION_KEY,
      studentIds: [STUDENT_1],
      days: -2,
      awardedOn: "2026-11-16",
      description: "Valid description",
    }).success,
    false,
    "Negative days must be rejected"
  );

  assert.equal(
    awardDirectMeritsSchema.safeParse({
      submissionKey: VALID_SUBMISSION_KEY,
      studentIds: [STUDENT_1],
      days: 1.5,
      awardedOn: "2026-11-16",
      description: "Valid description",
    }).success,
    false,
    "Fractional days must be rejected"
  );

  assert.equal(
    awardDirectMeritsSchema.safeParse({
      submissionKey: VALID_SUBMISSION_KEY,
      studentIds: [STUDENT_1],
      days: 35,
      awardedOn: "2026-11-16",
      description: "Valid description",
    }).success,
    false,
    "Days > 30 must be rejected"
  );
});

test("awardDirectMeritsSchema rejects empty student selection", () => {
  const result = awardDirectMeritsSchema.safeParse({
    submissionKey: VALID_SUBMISSION_KEY,
    studentIds: [],
    days: 1,
    awardedOn: "2026-11-16",
    description: "Valid description",
  });

  assert.equal(result.success, false);
});

test("awardDirectMeritsSchema rejects invalid UUIDs", () => {
  assert.equal(
    awardDirectMeritsSchema.safeParse({
      submissionKey: "not-a-uuid",
      studentIds: [STUDENT_1],
      days: 1,
      awardedOn: "2026-11-16",
      description: "Valid description",
    }).success,
    false
  );

  assert.equal(
    awardDirectMeritsSchema.safeParse({
      submissionKey: VALID_SUBMISSION_KEY,
      studentIds: ["not-a-uuid"],
      days: 1,
      awardedOn: "2026-11-16",
      description: "Valid description",
    }).success,
    false
  );
});

test("awardDirectMeritsSchema rejects malformed dates", () => {
  assert.equal(
    awardDirectMeritsSchema.safeParse({
      submissionKey: VALID_SUBMISSION_KEY,
      studentIds: [STUDENT_1],
      days: 1,
      awardedOn: "16-11-2026",
      description: "Valid description",
    }).success,
    false
  );

  assert.equal(
    awardDirectMeritsSchema.safeParse({
      submissionKey: VALID_SUBMISSION_KEY,
      studentIds: [STUDENT_1],
      days: 1,
      awardedOn: "invalid-date",
      description: "Valid description",
    }).success,
    false
  );
});

test("awardDirectMeritsSchema validates description length and trimming", () => {
  assert.equal(
    awardDirectMeritsSchema.safeParse({
      submissionKey: VALID_SUBMISSION_KEY,
      studentIds: [STUDENT_1],
      days: 1,
      awardedOn: "2026-11-16",
      description: "  ",
    }).success,
    false,
    "Whitespace-only description must be rejected"
  );

  assert.equal(
    awardDirectMeritsSchema.safeParse({
      submissionKey: VALID_SUBMISSION_KEY,
      studentIds: [STUDENT_1],
      days: 1,
      awardedOn: "2026-11-16",
      description: "ab",
    }).success,
    false,
    "Description under 3 characters must be rejected"
  );

  assert.equal(
    awardDirectMeritsSchema.safeParse({
      submissionKey: VALID_SUBMISSION_KEY,
      studentIds: [STUDENT_1],
      days: 1,
      awardedOn: "2026-11-16",
      description: "x".repeat(501),
    }).success,
    false,
    "Description over 500 characters must be rejected"
  );
});
