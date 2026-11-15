import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateBucketBalance,
  calculateDisciplinarySummary,
  evaluateMeritState,
  getBucketDisciplinaryBalance,
  getTodayManila,
} from "./calculations.ts";

test("T-041 / FL-029: Disciplinary Office/RLE Balance Calculations", async (t) => {
  await t.test("calculateBucketBalance strictly mirrors PostgreSQL public.f_cmd_balance", () => {
    // 3 Office demerits: 2 active, 1 waived
    // 1 RLE demerit: active
    const demerits = [
      { bucket: "office", waived_at: null },
      { bucket: "office", waived_at: null },
      { bucket: "office", waived_at: "2026-09-01T10:00:00Z" },
      { bucket: "rle", waived_at: null },
    ];

    // 1 Office merit application
    const applications = [
      { bucket: "office" },
    ];

    // 2 Office service credits: 1 active, 1 revoked
    const serviceCredits = [
      { bucket: "office", revoked_at: null },
      { bucket: "office", revoked_at: "2026-10-01T12:00:00Z" },
    ];

    // Office: 2 active demerits - 1 applied merit - 1 active service credit = 0
    const officeBalance = calculateBucketBalance({
      demerits,
      applications,
      serviceCredits,
      bucket: "office",
    });
    assert.equal(officeBalance, 0);

    // RLE: 1 active demerit - 0 applied merits - 0 service credits = 1
    const rleBalance = calculateBucketBalance({
      demerits,
      applications,
      serviceCredits,
      bucket: "rle",
    });
    assert.equal(rleBalance, 1);
  });

  await t.test("cumulative calculation across all semesters without zero-floor clamp in raw balance", () => {
    // Zero demerits, 1 applied merit, 1 service credit
    const officeBalance = calculateBucketBalance({
      demerits: [],
      applications: [{ bucket: "office" }],
      serviceCredits: [{ bucket: "office", revoked_at: null }],
      bucket: "office",
    });
    // In f_cmd_balance: 0 - 1 - 1 = -2
    assert.equal(officeBalance, -2);
  });

  await t.test("getBucketDisciplinaryBalance breakdown returns accurate counts", () => {
    const demerits = [
      { bucket: "rle", waived_at: null },
      { bucket: "rle", waived_at: null },
      { bucket: "rle", waived_at: "2026-08-10T08:00:00Z" },
    ];
    const applications = [{ bucket: "rle" }];
    const serviceCredits = [{ bucket: "rle", revoked_at: null }];

    const stats = getBucketDisciplinaryBalance({
      demerits,
      applications,
      serviceCredits,
      bucket: "rle",
    });

    assert.equal(stats.totalDemerits, 3);
    assert.equal(stats.waivedDemerits, 1);
    assert.equal(stats.activeDemerits, 2);
    assert.equal(stats.appliedMerits, 1);
    assert.equal(stats.activeServiceCredits, 1);
    assert.equal(stats.revokedServiceCredits, 0);
    assert.equal(stats.balance, 0);
  });

  await t.test("evaluateMeritState accurately tracks available, applied, and expired awards", () => {
    const todayManila = "2026-11-15";
    const appliedSet = new Set(["merit-applied-1"]);

    // Case 1: Applied merit
    const mApplied = { id: "merit-applied-1", awarded_on: "2026-01-10", expires_on: "2027-01-10" };
    const stateApplied = evaluateMeritState(mApplied, appliedSet, todayManila);
    assert.equal(stateApplied.isApplied, true);
    assert.equal(stateApplied.isAvailable, false);
    assert.equal(stateApplied.isExpired, false);

    // Case 2: Available unexpired merit
    const mAvailable = { id: "merit-available-2", awarded_on: "2026-05-20", expires_on: "2027-05-20" };
    const stateAvailable = evaluateMeritState(mAvailable, appliedSet, todayManila);
    assert.equal(stateAvailable.isApplied, false);
    assert.equal(stateAvailable.isAvailable, true);
    assert.equal(stateAvailable.isExpired, false);

    // Case 3: Expired merit (expired yesterday or earlier)
    const mExpired = { id: "merit-expired-3", awarded_on: "2025-11-01", expires_on: "2026-11-01" };
    const stateExpired = evaluateMeritState(mExpired, appliedSet, todayManila);
    assert.equal(stateExpired.isApplied, false);
    assert.equal(stateExpired.isAvailable, false);
    assert.equal(stateExpired.isExpired, true);

    // Case 4: Expiration day boundary (expires_on === todayManila is expired per exclusive end condition)
    const mExpiringToday = { id: "merit-expired-today", awarded_on: "2025-11-15", expires_on: "2026-11-15" };
    const stateExpiringToday = evaluateMeritState(mExpiringToday, appliedSet, todayManila);
    assert.equal(stateExpiringToday.isExpired, true);
    assert.equal(stateExpiringToday.isAvailable, false);

    // Case 5: Future award (not yet active)
    const mFuture = { id: "merit-future-5", awarded_on: "2026-12-01", expires_on: "2027-12-01" };
    const stateFuture = evaluateMeritState(mFuture, appliedSet, todayManila);
    assert.equal(stateFuture.isAvailable, false);
    assert.equal(stateFuture.isExpired, false);
  });

  await t.test("calculateDisciplinarySummary aggregates Office, RLE, and cross-bucket merit metrics", () => {
    const summary = calculateDisciplinarySummary({
      demerits: [
        { bucket: "office", waived_at: null },
        { bucket: "office", waived_at: null },
        { bucket: "rle", waived_at: null },
      ],
      merits: [
        { id: "m1", awarded_on: "2026-06-01", expires_on: "2027-06-01" },
        { id: "m2", awarded_on: "2025-01-01", expires_on: "2026-01-01" },
        { id: "m3", awarded_on: "2026-07-01", expires_on: "2027-07-01" },
      ],
      applications: [
        { bucket: "office", merit_id: "m3" },
      ],
      serviceCredits: [
        { bucket: "rle", revoked_at: null },
      ],
      asOfDate: "2026-11-15",
    });

    // Office: 2 demerits - 1 merit application = 1
    assert.equal(summary.office.balance, 1);
    // RLE: 1 demerit - 1 service credit = 0
    assert.equal(summary.rle.balance, 0);

    // Merits: m1 available, m2 expired, m3 applied
    assert.equal(summary.merits.totalAwarded, 3);
    assert.equal(summary.merits.available, 1);
    assert.equal(summary.merits.expired, 1);
    assert.equal(summary.merits.totalApplied, 1);

    assert.equal(summary.totalActiveDemerits, 3);
    assert.equal(summary.totalActiveBalance, 1);
    assert.equal(summary.hasOutstandingDebt, true);
  });

  await t.test("getTodayManila returns valid ISO date YYYY-MM-DD", () => {
    const today = getTodayManila();
    assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
  });
});
