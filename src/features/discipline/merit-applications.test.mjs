import assert from "node:assert/strict";
import test from "node:test";

import { getAvailableMeritsFifo } from "./calculations.ts";
import {
  applyMeritsSchema,
  disciplinaryBucketSchema,
} from "./schemas.ts";

const VALID_KEY = "11111111-1111-4111-8111-111111111111";

// ============================================================================
// 1. applyMeritsSchema & disciplinaryBucketSchema
// ============================================================================

test("disciplinaryBucketSchema accepts valid buckets and rejects invalid values", () => {
  assert.equal(disciplinaryBucketSchema.safeParse("office").success, true);
  assert.equal(disciplinaryBucketSchema.safeParse("rle").success, true);
  assert.equal(disciplinaryBucketSchema.safeParse("Office").success, false);
  assert.equal(disciplinaryBucketSchema.safeParse("general").success, false);
  assert.equal(disciplinaryBucketSchema.safeParse("").success, false);
  assert.equal(disciplinaryBucketSchema.safeParse(null).success, false);
});

test("applyMeritsSchema accepts valid application payloads and coerces numeric string days", () => {
  const resultOffice = applyMeritsSchema.safeParse({
    requestKey: VALID_KEY,
    bucket: "office",
    days: 3,
  });
  assert.equal(resultOffice.success, true);
  if (resultOffice.success) {
    assert.equal(resultOffice.data.requestKey, VALID_KEY);
    assert.equal(resultOffice.data.bucket, "office");
    assert.equal(resultOffice.data.days, 3);
  }

  const resultRle = applyMeritsSchema.safeParse({
    requestKey: VALID_KEY,
    bucket: "rle",
    days: "5",
  });
  assert.equal(resultRle.success, true);
  if (resultRle.success) {
    assert.equal(resultRle.data.bucket, "rle");
    assert.equal(resultRle.data.days, 5);
  }
});

test("applyMeritsSchema enforces no arbitrary upper cap on days", () => {
  for (const days of [1, 7, 30, 50, 100, 1000000]) {
    const res = applyMeritsSchema.safeParse({
      requestKey: VALID_KEY,
      bucket: "office",
      days,
    });
    assert.equal(res.success, true, `days=${days} should succeed without arbitrary cap`);
  }
});

test("applyMeritsSchema rejects invalid requestKey UUIDs", () => {
  for (const badKey of ["not-a-uuid", "12345", "", null, undefined]) {
    const res = applyMeritsSchema.safeParse({
      requestKey: badKey,
      bucket: "office",
      days: 1,
    });
    assert.equal(res.success, false, `key=${badKey} should fail UUID validation`);
  }
});

test("applyMeritsSchema rejects invalid buckets", () => {
  for (const badBucket of ["classroom", "general", "OFFICE", "", null, undefined]) {
    const res = applyMeritsSchema.safeParse({
      requestKey: VALID_KEY,
      bucket: badBucket,
      days: 1,
    });
    assert.equal(res.success, false, `bucket=${badBucket} should fail`);
  }
});

test("applyMeritsSchema rejects non-positive or non-whole days", () => {
  for (const badDays of [0, -1, -50, 1.5, 2.99, "abc", "", null, undefined]) {
    const res = applyMeritsSchema.safeParse({
      requestKey: VALID_KEY,
      bucket: "office",
      days: badDays,
    });
    assert.equal(res.success, false, `days=${badDays} should fail`);
  }
});

// ============================================================================
// 2. getAvailableMeritsFifo
// ============================================================================

test("getAvailableMeritsFifo sorts strictly by expires_on ASC (FIFO earliest expiring first)", () => {
  const TODAY = "2026-11-20";
  const merits = [
    { id: "m-3", awarded_on: "2026-05-01", expires_on: "2027-05-01", description: "Merit 3" },
    { id: "m-1", awarded_on: "2026-01-01", expires_on: "2027-01-01", description: "Merit 1" },
    { id: "m-2", awarded_on: "2026-03-01", expires_on: "2027-03-01", description: "Merit 2" },
  ];

  const result = getAvailableMeritsFifo(merits, new Set(), TODAY);

  assert.equal(result.length, 3);
  assert.equal(result[0].id, "m-1");
  assert.equal(result[1].id, "m-2");
  assert.equal(result[2].id, "m-3");
});

test("getAvailableMeritsFifo deterministically breaks ties by id ASC when expires_on matches", () => {
  const TODAY = "2026-11-20";
  const merits = [
    { id: "c-unit", awarded_on: "2026-06-01", expires_on: "2027-06-01", description: "Unit C" },
    { id: "a-unit", awarded_on: "2026-06-01", expires_on: "2027-06-01", description: "Unit A" },
    { id: "b-unit", awarded_on: "2026-06-01", expires_on: "2027-06-01", description: "Unit B" },
  ];

  const result = getAvailableMeritsFifo(merits, new Set(), TODAY);

  assert.equal(result.length, 3);
  assert.equal(result[0].id, "a-unit");
  assert.equal(result[1].id, "b-unit");
  assert.equal(result[2].id, "c-unit");
});

test("getAvailableMeritsFifo respects date boundaries and exclusions", () => {
  const TODAY = "2026-11-20";
  const merits = [
    // Valid: awarded today, expires in 1 year
    { id: "valid-today", awarded_on: "2026-11-20", expires_on: "2027-11-20", description: "Awarded today" },
    // Valid: awarded in past, unexpired
    { id: "valid-past", awarded_on: "2026-08-15", expires_on: "2027-08-15", description: "Valid past award" },
    // Excluded: future awarded (awarded_on > today)
    { id: "future", awarded_on: "2026-11-21", expires_on: "2027-11-21", description: "Future award" },
    // Excluded: expires today (expires_on <= today is expired in f_cmd_balance)
    { id: "expires-today", awarded_on: "2025-11-20", expires_on: "2026-11-20", description: "Expires today" },
    // Excluded: already expired in past
    { id: "expired-past", awarded_on: "2025-05-10", expires_on: "2026-05-10", description: "Expired past" },
    // Excluded: already applied
    { id: "applied", awarded_on: "2026-09-01", expires_on: "2027-09-01", description: "Already applied" },
  ];

  const appliedIds = new Set(["applied"]);
  const result = getAvailableMeritsFifo(merits, appliedIds, TODAY);

  const resultIds = result.map((m) => m.id);
  assert.deepEqual(resultIds, ["valid-past", "valid-today"]);
});

test("getAvailableMeritsFifo is immutable and strips extra server properties", () => {
  const TODAY = "2026-11-20";
  const original = [
    {
      id: "m-unit-2",
      awarded_on: "2026-02-01",
      expires_on: "2027-02-01",
      description: "Leadership",
      award_request_key: "secret-key-1",
      award_unit_index: 1,
    },
    {
      id: "m-unit-1",
      awarded_on: "2026-01-01",
      expires_on: "2027-01-01",
      description: "Service",
      award_request_key: "secret-key-2",
      award_unit_index: 2,
    },
  ];

  const originalCopy = JSON.parse(JSON.stringify(original));
  const result = getAvailableMeritsFifo(original, new Set(), TODAY);

  // Immutability: input array order and contents are completely unchanged
  assert.deepEqual(original, originalCopy);
  assert.equal(original[0].id, "m-unit-2");

  // Output is sorted FIFO
  assert.equal(result[0].id, "m-unit-1");
  assert.equal(result[1].id, "m-unit-2");

  // Property stripping: only clean AvailableMerit fields are retained
  assert.deepEqual(Object.keys(result[0]).sort(), ["awarded_on", "description", "expires_on", "id"]);
  assert.equal("award_request_key" in result[0], false);
  assert.equal("award_unit_index" in result[0], false);
});
