import assert from "node:assert/strict";
import test from "node:test";

import { meritExpiryDate } from "./calculations.ts";
import { awardDirectMeritsSchema } from "./schemas.ts";

const KEY_1 = "11111111-1111-4111-8111-111111111111";
const KEY_2 = "44444444-4444-4444-8444-444444444444";
const STUDENT_1 = "22222222-2222-4222-8222-222222222222";
const STUDENT_2 = "33333333-3333-4333-8333-333333333333";

const valid = {
  recipients: [{ studentId: STUDENT_1, requestKey: KEY_1 }, { studentId: STUDENT_2, requestKey: KEY_2 }],
  days: 3,
  awardedOn: "2026-11-16",
  description: "Voluntary clinical outreach assistance.",
};
const parse = (patch) => awardDirectMeritsSchema.safeParse({ ...valid, ...patch });

test("awardDirectMeritsSchema accepts a valid award and coerces days", () => {
  assert.equal(parse({}).success, true);
  const coerced = parse({ days: "5" });
  assert.equal(coerced.success && coerced.data.days, 5);
  // Product cap: at most 5 days per entry.
  assert.equal(parse({ days: 6 }).success, false);
});

test("awardDirectMeritsSchema rejects non-whole or non-positive days", () => {
  for (const days of [0, -2, 1.5, "", "abc"]) assert.equal(parse({ days }).success, false, `days=${days}`);
});

test("awardDirectMeritsSchema rejects empty, duplicate or malformed recipients", () => {
  assert.equal(parse({ recipients: [] }).success, false);
  assert.equal(parse({ recipients: [{ studentId: STUDENT_1, requestKey: KEY_1 }, { studentId: STUDENT_1, requestKey: KEY_2 }] }).success, false);
  assert.equal(parse({ recipients: [{ studentId: "not-a-uuid", requestKey: KEY_1 }] }).success, false);
  assert.equal(parse({ recipients: [{ studentId: STUDENT_1, requestKey: "not-a-uuid" }] }).success, false);
});

test("awardDirectMeritsSchema rejects malformed or impossible dates", () => {
  for (const awardedOn of ["16-11-2026", "invalid-date", "2026-02-30"]) assert.equal(parse({ awardedOn }).success, false, awardedOn);
});

test("awardDirectMeritsSchema trims and bounds the reason", () => {
  assert.equal(parse({ description: "  " }).success, false);
  assert.equal(parse({ description: "ab" }).success, false);
  assert.equal(parse({ description: "x".repeat(501) }).success, false);
  const trimmed = parse({ description: "  Helped at the clinic  " });
  assert.equal(trimmed.success && trimmed.data.description, "Helped at the clinic");
});

test("meritExpiryDate matches award_merits' one-year expiry", () => {
  assert.equal(meritExpiryDate("2026-11-16"), "2027-11-16");
  assert.equal(meritExpiryDate("2027-12-31"), "2028-12-31");
  // Postgres: date '2028-02-29' + interval '1 year' = 2029-02-28.
  assert.equal(meritExpiryDate("2028-02-29"), "2029-02-28");
});
