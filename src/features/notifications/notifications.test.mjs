import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { getNotificationMeta, NOTIFICATION_KINDS } from "./contracts.ts";
import { notificationIdSchema } from "./schemas.ts";

describe("Notification kinds & route mappings", () => {
  test("matches the database trigger allowlist", () => {
    const guard = readFileSync(
      new URL("../../../supabase/migrations/20261112060000_council_member_management.sql", import.meta.url),
      "utf8",
    );
    const allowlist = guard.match(/new\.kind not in \(([^)]*)\)/)[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1));
    assert.deepEqual([...NOTIFICATION_KINDS].sort(), allowlist.sort());
  });

  test("maps merit, demerit, and service to /student/merits-demerits-and-services", () => {
    for (const kind of ["merit_received", "demerit_incurred", "service_recorded"]) {
      assert.equal(getNotificationMeta(kind).href, "/student/merits-demerits-and-services");
    }
  });

  test("maps obligation and payment outcomes to /student/fees-and-fines", () => {
    for (const kind of ["obligation_due", "payment_verified", "payment_rejected"]) {
      const meta = getNotificationMeta(kind);
      assert.equal(meta.href, "/student/fees-and-fines");
      assert.equal(meta.category, "finance");
    }
  });

  test("council_access_changed stays in the student workspace (removed members cannot open /council)", () => {
    const council = getNotificationMeta("council_access_changed");
    assert.equal(council.href, "/student");
    assert.equal(council.category, "access");
  });

  test("unknown kinds fall back to the student home", () => {
    assert.equal(getNotificationMeta("unknown_random_kind").href, "/student");
  });
});

describe("notificationIdSchema", () => {
  test("accepts UUIDs and rejects other strings", () => {
    assert.equal(notificationIdSchema.safeParse("550e8400-e29b-41d4-a716-446655440000").success, true);
    assert.equal(notificationIdSchema.safeParse("not-a-valid-uuid").success, false);
    assert.equal(notificationIdSchema.safeParse("").success, false);
  });
});
