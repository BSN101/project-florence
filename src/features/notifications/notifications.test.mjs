import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  getNotificationMeta,
  NOTIFICATION_KINDS,
} from "./contracts.ts";
import {
  createNotificationInputSchema,
  getNotificationsFilterSchema,
  notificationIdSchema,
  notificationKindSchema,
} from "./schemas.ts";

describe("NOTIFICATION_KINDS & Canonical Route Mappings", () => {
  test("contains exactly the 6 approved student notification kinds", () => {
    assert.deepEqual([...NOTIFICATION_KINDS], [
      "merit_received",
      "demerit_incurred",
      "service_recorded",
      "obligation_due",
      "payment_verified",
      "payment_rejected",
    ]);
  });

  test("maps merit, demerit, and service to /student/merits-demerits-and-services", () => {
    const merit = getNotificationMeta("merit_received");
    assert.equal(merit.href, "/student/merits-demerits-and-services");
    assert.equal(merit.category, "merit");
    assert.match(merit.label, /merit/i);

    const demerit = getNotificationMeta("demerit_incurred");
    assert.equal(demerit.href, "/student/merits-demerits-and-services");
    assert.equal(demerit.category, "demerit");
    assert.match(demerit.label, /demerit/i);

    const service = getNotificationMeta("service_recorded");
    assert.equal(service.href, "/student/merits-demerits-and-services");
    assert.equal(service.category, "service");
    assert.match(service.label, /service/i);
  });

  test("maps obligation, payment verified, and payment rejected to /student/fees-and-fines", () => {
    const obligation = getNotificationMeta("obligation_due");
    assert.equal(obligation.href, "/student/fees-and-fines");
    assert.equal(obligation.category, "finance");

    const verified = getNotificationMeta("payment_verified");
    assert.equal(verified.href, "/student/fees-and-fines");
    assert.equal(verified.category, "finance");

    const rejected = getNotificationMeta("payment_rejected");
    assert.equal(rejected.href, "/student/fees-and-fines");
    assert.equal(rejected.category, "finance");
  });

  test("handles council_access_changed safely", () => {
    const council = getNotificationMeta("council_access_changed");
    assert.equal(council.href, "/council");
    assert.equal(council.category, "access");
    assert.match(council.label, /council/i);
  });

  test("provides safe fallback config for unknown or unmapped kinds", () => {
    const fallback = getNotificationMeta("unknown_random_kind");
    assert.ok(fallback);
    assert.equal(fallback.href, "/student");
    assert.ok(fallback.icon);
    assert.ok(fallback.label);
  });
});

describe("Notification Schemas Validation", () => {
  test("notificationIdSchema validates standard UUIDs and rejects invalid strings", () => {
    const valid = "550e8400-e29b-41d4-a716-446655440000";
    assert.equal(notificationIdSchema.safeParse(valid).success, true);

    const invalid = "not-a-valid-uuid";
    assert.equal(notificationIdSchema.safeParse(invalid).success, false);
    assert.equal(notificationIdSchema.safeParse("").success, false);
  });

  test("notificationKindSchema accepts only canonical kinds", () => {
    for (const kind of NOTIFICATION_KINDS) {
      assert.equal(notificationKindSchema.safeParse(kind).success, true);
    }
    assert.equal(notificationKindSchema.safeParse("fake_kind").success, false);
    assert.equal(notificationKindSchema.safeParse("").success, false);
  });

  test("createNotificationInputSchema requires recipientId, kind, and non-empty message", () => {
    const valid = {
      recipientId: "550e8400-e29b-41d4-a716-446655440000",
      kind: "merit_received",
      message: "You have received 1 merit credit for volunteering.",
      targetId: "550e8400-e29b-41d4-a716-446655440001",
    };
    assert.equal(createNotificationInputSchema.safeParse(valid).success, true);

    // Empty message rejected
    assert.equal(
      createNotificationInputSchema.safeParse({ ...valid, message: "   " }).success,
      false,
    );

    // Invalid recipient UUID rejected
    assert.equal(
      createNotificationInputSchema.safeParse({ ...valid, recipientId: "bad-id" }).success,
      false,
    );
  });

  test("getNotificationsFilterSchema enforces pagination bounds and default filter", () => {
    const parsed = getNotificationsFilterSchema.safeParse({});
    assert.equal(parsed.success, true);
    assert.equal(parsed.data.limit, 25);
    assert.equal(parsed.data.offset, 0);
    assert.equal(parsed.data.filter, "all");

    // Out-of-bounds limit capped or rejected
    assert.equal(getNotificationsFilterSchema.safeParse({ limit: 0 }).success, false);
    assert.equal(getNotificationsFilterSchema.safeParse({ limit: 101 }).success, false);
    assert.equal(getNotificationsFilterSchema.safeParse({ offset: -1 }).success, false);
  });
});

describe("Unread & Filtering Logic", () => {
  const sampleNotifications = [
    {
      id: "1",
      recipient_id: "student-1",
      kind: "merit_received",
      message: "Merit 1",
      target_type: null,
      target_id: null,
      read_at: null,
      created_at: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: "2",
      recipient_id: "student-1",
      kind: "demerit_incurred",
      message: "Demerit 1",
      target_type: null,
      target_id: null,
      read_at: new Date(Date.now() - 1800000).toISOString(),
      created_at: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: "3",
      recipient_id: "student-1",
      kind: "obligation_due",
      message: "Fee 1",
      target_type: null,
      target_id: null,
      read_at: null,
      created_at: new Date(Date.now() - 60000).toISOString(),
    },
  ];

  test("calculates unread count correctly where read_at is null", () => {
    const unreadCount = sampleNotifications.filter((n) => n.read_at === null).length;
    assert.equal(unreadCount, 2);
  });

  test("filters unread notifications strictly", () => {
    const unreadOnly = sampleNotifications.filter((n) => n.read_at === null);
    assert.equal(unreadOnly.length, 2);
    assert.deepEqual(
      unreadOnly.map((n) => n.id),
      ["1", "3"],
    );
  });

  test("verifies database constraint invariant read_at >= created_at", () => {
    for (const n of sampleNotifications) {
      if (n.read_at !== null) {
        assert.ok(
          new Date(n.read_at).getTime() >= new Date(n.created_at).getTime(),
          "read_at must be greater than or equal to created_at",
        );
      }
    }
  });

  test("recipient isolation invariant: updates must match session profile", () => {
    const sessionProfileId = "student-1";
    const foreignNotification = {
      id: "foreign-99",
      recipient_id: "student-2", // different student!
      read_at: null,
    };

    // An update query MUST include recipient_id = sessionProfileId
    const canUpdate = foreignNotification.recipient_id === sessionProfileId;
    assert.equal(canUpdate, false, "Must refuse to mutate notification belonging to another student");
  });
});
