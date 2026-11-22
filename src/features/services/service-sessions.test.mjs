import assert from "node:assert/strict";
import test from "node:test";

import {
  allowedServiceBuckets,
  canCreateServiceSession,
  canManageSession,
  combineDateAndTimeManila,
  countServiceParticipants,
  evaluateAttendanceStatus,
  extractTimeHHmmManila,
  isTimeWithinWindow,
} from "./calculations.ts";
import {
  createServiceSessionSchema,
  participantAttendanceRowSchema,
  serviceBucketSchema,
  setServiceParticipantsSchema,
} from "./schemas.ts";

const VALID_KEY = "11111111-1111-4111-8111-111111111111";
const VALID_SESSION_ID = "22222222-2222-4222-8222-222222222222";
const STUDENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STUDENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ACTOR_ID = "99999999-9999-4999-8999-999999999999";

// ============================================================================
// 1. Role & Session Eligibility (calculations.ts)
// ============================================================================

test("allowedServiceBuckets resolves instructor tracks to their matching buckets", () => {
  assert.deepEqual(allowedServiceBuckets(["Academic Instructor"]), ["office"]);
  assert.deepEqual(
    allowedServiceBuckets(["Academic Instructor", "Academic Coordinator"]),
    ["office"]
  );
  assert.deepEqual(allowedServiceBuckets(["Clinical Instructor"]), ["rle"]);
  assert.deepEqual(
    allowedServiceBuckets(["Clinical Instructor", "RLE Coordinator"]),
    ["rle"]
  );
  // Dual-role instructor receives both buckets enabling explicit selection
  assert.deepEqual(
    allowedServiceBuckets(["Academic Instructor", "Clinical Instructor"]),
    ["office", "rle"]
  );
  // Coordinator title alone does not grant instructor authority (FL-037 / f_cmd_instructor)
  assert.deepEqual(allowedServiceBuckets(["Academic Coordinator"]), []);
  assert.deepEqual(allowedServiceBuckets(["RLE Coordinator"]), []);
  assert.deepEqual(allowedServiceBuckets(["Student"]), []);
  assert.deepEqual(allowedServiceBuckets([]), []);
});

test("canCreateServiceSession requires current semester context and instructor role", () => {
  assert.equal(canCreateServiceSession(["Academic Instructor"], true), true);
  assert.equal(canCreateServiceSession(["Clinical Instructor"], true), true);
  assert.equal(
    canCreateServiceSession(["Academic Instructor", "Clinical Instructor"], true),
    true
  );
  // Past semester is strictly blocked from creating new service sessions
  assert.equal(canCreateServiceSession(["Academic Instructor"], false), false);
  assert.equal(canCreateServiceSession(["Clinical Instructor"], false), false);
  // Non-instructors are blocked even in current semester
  assert.equal(canCreateServiceSession(["Academic Coordinator"], true), false);
  assert.equal(canCreateServiceSession(["Student"], true), false);
  assert.equal(canCreateServiceSession([], true), false);
});

test("canManageSession enforces issuer ownership, open status, and active semester context", () => {
  const openSession = { created_by: ACTOR_ID, ended_at: null };
  const endedSession = {
    created_by: ACTOR_ID,
    ended_at: "2026-11-25T17:00:00+08:00",
  };
  const otherUserSession = {
    created_by: "88888888-8888-4888-8888-888888888888",
    ended_at: null,
  };

  assert.equal(canManageSession(openSession, ACTOR_ID, true), true);
  // Non-owner cannot manage participants
  assert.equal(canManageSession(otherUserSession, ACTOR_ID, true), false);
  // Finalized session is read-only
  assert.equal(canManageSession(endedSession, ACTOR_ID, true), false);
  // Past semester is read-only
  assert.equal(canManageSession(openSession, ACTOR_ID, false), false);
});

// ============================================================================
// 2. Manila Time & Window Helpers (calculations.ts)
// ============================================================================

test("combineDateAndTimeManila anchors duty times deterministically to Asia/Manila (+08:00)", () => {
  assert.equal(
    combineDateAndTimeManila("2026-11-25", "08:30"),
    "2026-11-25T08:30:00+08:00"
  );
  assert.equal(
    combineDateAndTimeManila("2026-11-25", "17:45:30"),
    "2026-11-25T17:45:30+08:00"
  );
  assert.equal(
    combineDateAndTimeManila(" 2026-11-25 ", " 09:00 "),
    "2026-11-25T09:00:00+08:00"
  );
});

test("extractTimeHHmmManila extracts 24-hour HH:mm in Philippine Standard Time", () => {
  assert.equal(extractTimeHHmmManila("2026-11-25T08:30:00+08:00"), "08:30");
  assert.equal(extractTimeHHmmManila("2026-11-25T17:45:00+08:00"), "17:45");
  // UTC timestamp crossing midnight into the next Manila day (+8 hours)
  // 16:30 UTC on 2026-11-21 + 8 hours = 00:30 Manila time on 2026-11-22
  assert.equal(extractTimeHHmmManila("2026-11-21T16:30:00Z"), "00:30");
  // Invalid inputs return safe empty string
  assert.equal(extractTimeHHmmManila("not-a-timestamp"), "");
  assert.equal(extractTimeHHmmManila(""), "");
});

test("isTimeWithinWindow verifies inclusive window boundaries and non-future constraints", () => {
  const from = "2026-11-25T07:30:00+08:00";
  const until = "2026-11-25T09:00:00+08:00";
  const now = "2026-11-25T08:00:00+08:00";

  // Inclusive start and end bounds
  assert.equal(isTimeWithinWindow(from, from, until), true);
  assert.equal(isTimeWithinWindow(until, from, until), true);
  assert.equal(isTimeWithinWindow("2026-11-25T08:15:00+08:00", from, until), true);

  // Outside bounds
  assert.equal(
    isTimeWithinWindow("2026-11-25T07:29:59+08:00", from, until),
    false
  );
  assert.equal(
    isTimeWithinWindow("2026-11-25T09:00:01+08:00", from, until),
    false
  );

  // Future timestamp validation relative to now
  assert.equal(isTimeWithinWindow("2026-11-25T08:00:00+08:00", from, until, now), true);
  assert.equal(isTimeWithinWindow("2026-11-25T08:00:01+08:00", from, until, now), false);

  // Invalid timestamp inputs safely return false
  assert.equal(isTimeWithinWindow("invalid", from, until), false);
  assert.equal(isTimeWithinWindow("2026-11-25T08:00:00+08:00", "invalid", until), false);
});

// ============================================================================
// 3. Attendance Evaluation & Counters (calculations.ts)
// ============================================================================

test("evaluateAttendanceStatus accurately evaluates all 7 attendance states", () => {
  const session = {
    scheduled_start: "2026-11-25T08:00:00+08:00",
    late_after_minutes: 15, // late threshold is 08:15:00
    time_out_until: "2026-11-25T18:00:00+08:00",
    ended_at: null,
  };

  // 1. Excluded takes precedence even if timestamps are present
  assert.equal(
    evaluateAttendanceStatus(
      {
        time_in: "2026-11-25T08:00:00+08:00",
        time_out: "2026-11-25T17:00:00+08:00",
        excluded_at: "2026-11-25T09:00:00+08:00",
      },
      session
    ),
    "excluded"
  );

  // 2. Not recorded
  assert.equal(
    evaluateAttendanceStatus(
      { time_in: null, time_out: null, excluded_at: null },
      session
    ),
    "not_recorded"
  );

  // 3. Missing time-in (time-out recorded without time-in)
  assert.equal(
    evaluateAttendanceStatus(
      {
        time_in: null,
        time_out: "2026-11-25T17:00:00+08:00",
        excluded_at: null,
      },
      session
    ),
    "missing_time_in"
  );

  // 4. In progress (time-in recorded, time-out window has not passed)
  assert.equal(
    evaluateAttendanceStatus(
      {
        time_in: "2026-11-25T08:00:00+08:00",
        time_out: null,
        excluded_at: null,
      },
      session,
      "2026-11-25T12:00:00+08:00"
    ),
    "in_progress"
  );

  // 5. Missing time-out (window passed or session finalized without time-out)
  assert.equal(
    evaluateAttendanceStatus(
      {
        time_in: "2026-11-25T08:00:00+08:00",
        time_out: null,
        excluded_at: null,
      },
      session,
      "2026-11-25T18:00:01+08:00" // 1s past time_out_until
    ),
    "missing_time_out"
  );

  assert.equal(
    evaluateAttendanceStatus(
      {
        time_in: "2026-11-25T08:00:00+08:00",
        time_out: null,
        excluded_at: null,
      },
      { ...session, ended_at: "2026-11-25T17:30:00+08:00" }
    ),
    "missing_time_out"
  );

  // 6. Present on-time (timed in before or at scheduled_start + late_after_minutes)
  assert.equal(
    evaluateAttendanceStatus(
      {
        time_in: "2026-11-25T08:05:00+08:00",
        time_out: "2026-11-25T17:00:00+08:00",
        excluded_at: null,
      },
      session
    ),
    "present_on_time"
  );

  // Exact grace boundary: 08:00:00 + 15m = 08:15:00 is on time
  assert.equal(
    evaluateAttendanceStatus(
      {
        time_in: "2026-11-25T08:15:00+08:00",
        time_out: "2026-11-25T17:00:00+08:00",
        excluded_at: null,
      },
      session
    ),
    "present_on_time"
  );

  // 7. Late (1 second past grace threshold)
  assert.equal(
    evaluateAttendanceStatus(
      {
        time_in: "2026-11-25T08:15:01+08:00",
        time_out: "2026-11-25T17:00:00+08:00",
        excluded_at: null,
      },
      session
    ),
    "late"
  );
});

test("countServiceParticipants aggregates participant status counts accurately", () => {
  const statuses = [
    "present_on_time",
    "present_on_time",
    "late",
    "in_progress",
    "missing_time_in",
    "missing_time_out",
    "not_recorded",
    "excluded",
  ];

  const counts = countServiceParticipants(statuses);
  assert.equal(counts.total, 8);
  assert.equal(counts.presentOnTime, 2);
  assert.equal(counts.late, 1);
  assert.equal(counts.inProgress, 1);
  assert.equal(counts.missingTimeIn, 1);
  assert.equal(counts.missingTimeOut, 1);
  assert.equal(counts.notRecorded, 1);
  assert.equal(counts.excluded, 1);
});

// ============================================================================
// 4. Validation Schemas (schemas.ts)
// ============================================================================

test("serviceBucketSchema accepts office and rle, rejecting invalid values", () => {
  assert.equal(serviceBucketSchema.safeParse("office").success, true);
  assert.equal(serviceBucketSchema.safeParse("rle").success, true);
  assert.equal(serviceBucketSchema.safeParse("Office").success, false);
  assert.equal(serviceBucketSchema.safeParse("general").success, false);
  assert.equal(serviceBucketSchema.safeParse("").success, false);
  assert.equal(serviceBucketSchema.safeParse(null).success, false);
});

test("createServiceSessionSchema accepts valid session inputs and coerces fields", () => {
  const valid = {
    requestKey: VALID_KEY,
    bucket: "office",
    dutyOn: "2026-11-25",
    scheduledStart: "2026-11-25T08:00:00+08:00",
    scheduledEnd: "2026-11-25T17:00:00+08:00",
    location: "College of Nursing Room 302",
    lateAfterMinutes: 15,
    timeInFrom: "2026-11-25T07:30:00+08:00",
    timeInUntil: "2026-11-25T09:00:00+08:00",
    timeOutFrom: "2026-11-25T16:30:00+08:00",
    timeOutUntil: "2026-11-25T18:00:00+08:00",
  };

  const parsed = createServiceSessionSchema.safeParse(valid);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.lateAfterMinutes, 15);
    assert.equal(parsed.data.location, "College of Nursing Room 302");
  }

  // Coerces string lateAfterMinutes and allows 0
  const parsedCoerced = createServiceSessionSchema.safeParse({
    ...valid,
    lateAfterMinutes: "0",
  });
  assert.equal(parsedCoerced.success, true);
  if (parsedCoerced.success) {
    assert.equal(parsedCoerced.data.lateAfterMinutes, 0);
  }

  // Supports PostgreSQL 32-bit signed integer cap (T-048 bc9911b)
  const parsedMaxInt = createServiceSessionSchema.safeParse({
    ...valid,
    lateAfterMinutes: 2147483647,
  });
  assert.equal(parsedMaxInt.success, true);

  // Normalizes empty/whitespace location to null
  const parsedBlankLoc = createServiceSessionSchema.safeParse({
    ...valid,
    location: "   ",
  });
  assert.equal(parsedBlankLoc.success, true);
  if (parsedBlankLoc.success) {
    assert.equal(parsedBlankLoc.data.location, null);
  }
});

test("createServiceSessionSchema rejects invalid dates, window orders, and bounds", () => {
  const base = {
    requestKey: VALID_KEY,
    bucket: "office",
    dutyOn: "2026-11-25",
    scheduledStart: "2026-11-25T08:00:00+08:00",
    scheduledEnd: "2026-11-25T17:00:00+08:00",
    location: "Room 101",
    lateAfterMinutes: 15,
    timeInFrom: "2026-11-25T07:30:00+08:00",
    timeInUntil: "2026-11-25T09:00:00+08:00",
    timeOutFrom: "2026-11-25T16:30:00+08:00",
    timeOutUntil: "2026-11-25T18:00:00+08:00",
  };

  // 1. Impossible calendar date
  assert.equal(
    createServiceSessionSchema.safeParse({ ...base, dutyOn: "2026-02-31" }).success,
    false
  );

  // 2. Missing timezone offset
  assert.equal(
    createServiceSessionSchema.safeParse({
      ...base,
      scheduledStart: "2026-11-25T08:00:00",
    }).success,
    false
  );

  // 3. scheduledStart on a different Manila date
  assert.equal(
    createServiceSessionSchema.safeParse({
      ...base,
      scheduledStart: "2026-11-24T08:00:00+08:00",
    }).success,
    false
  );

  // 4. scheduledEnd crossing midnight in Manila (+08:00)
  // 17:00 UTC = 01:00 on Nov 26 in Manila (+08:00) -> date mismatch
  assert.equal(
    createServiceSessionSchema.safeParse({
      ...base,
      scheduledEnd: "2026-11-25T17:00:00Z",
    }).success,
    false
  );

  // 5. scheduledEnd <= scheduledStart
  assert.equal(
    createServiceSessionSchema.safeParse({
      ...base,
      scheduledEnd: "2026-11-25T08:00:00+08:00",
    }).success,
    false
  );
  assert.equal(
    createServiceSessionSchema.safeParse({
      ...base,
      scheduledEnd: "2026-11-25T07:59:00+08:00",
    }).success,
    false
  );

  // 6. timeInUntil < timeInFrom
  assert.equal(
    createServiceSessionSchema.safeParse({
      ...base,
      timeInFrom: "2026-11-25T09:00:00+08:00",
      timeInUntil: "2026-11-25T08:00:00+08:00",
    }).success,
    false
  );

  // 7. timeOutUntil < timeOutFrom
  assert.equal(
    createServiceSessionSchema.safeParse({
      ...base,
      timeOutFrom: "2026-11-25T18:00:00+08:00",
      timeOutUntil: "2026-11-25T17:00:00+08:00",
    }).success,
    false
  );

  // 8. Negative, decimal, or overflow lateAfterMinutes
  assert.equal(
    createServiceSessionSchema.safeParse({ ...base, lateAfterMinutes: -1 }).success,
    false
  );
  assert.equal(
    createServiceSessionSchema.safeParse({ ...base, lateAfterMinutes: 15.5 }).success,
    false
  );
  assert.equal(
    createServiceSessionSchema.safeParse({ ...base, lateAfterMinutes: 2147483648 })
      .success,
    false
  );

  // 9. Location too long (> 255 chars)
  assert.equal(
    createServiceSessionSchema.safeParse({ ...base, location: "A".repeat(256) })
      .success,
    false
  );
});

test("participantAttendanceRowSchema validates attendance and ordering constraints", () => {
  // Valid null timestamps
  assert.equal(
    participantAttendanceRowSchema.safeParse({
      studentId: STUDENT_A,
      timeIn: null,
      timeOut: null,
      excluded: false,
    }).success,
    true
  );

  // Excluded rows keep recorded times, so re-including restores attendance
  assert.equal(
    participantAttendanceRowSchema.safeParse({
      studentId: STUDENT_A,
      timeIn: "2026-11-25T08:05:00+08:00",
      timeOut: "2026-11-25T16:45:00+08:00",
      excluded: true,
    }).success,
    true
  );

  // Valid time-in only (in progress)
  assert.equal(
    participantAttendanceRowSchema.safeParse({
      studentId: STUDENT_A,
      timeIn: "2026-11-25T08:00:00+08:00",
      timeOut: null,
      excluded: false,
    }).success,
    true
  );

  // Valid complete attendance
  assert.equal(
    participantAttendanceRowSchema.safeParse({
      studentId: STUDENT_A,
      timeIn: "2026-11-25T08:00:00+08:00",
      timeOut: "2026-11-25T17:00:00+08:00",
      excluded: false,
    }).success,
    true
  );

  // Valid excluded participant
  assert.equal(
    participantAttendanceRowSchema.safeParse({
      studentId: STUDENT_A,
      timeIn: null,
      timeOut: null,
      excluded: true,
    }).success,
    true
  );

  // Rejects time-out recorded without time-in (SQL set_service_participants)
  assert.equal(
    participantAttendanceRowSchema.safeParse({
      studentId: STUDENT_A,
      timeIn: null,
      timeOut: "2026-11-25T17:00:00+08:00",
      excluded: false,
    }).success,
    false
  );

  // Rejects time-out <= time-in
  assert.equal(
    participantAttendanceRowSchema.safeParse({
      studentId: STUDENT_A,
      timeIn: "2026-11-25T08:00:00+08:00",
      timeOut: "2026-11-25T08:00:00+08:00",
      excluded: false,
    }).success,
    false
  );
  assert.equal(
    participantAttendanceRowSchema.safeParse({
      studentId: STUDENT_A,
      timeIn: "2026-11-25T17:00:00+08:00",
      timeOut: "2026-11-25T08:00:00+08:00",
      excluded: false,
    }).success,
    false
  );
});

test("setServiceParticipantsSchema rejects duplicate students and enforces batch bounds", () => {
  const rowA = {
    studentId: STUDENT_A,
    timeIn: null,
    timeOut: null,
    excluded: false,
  };
  const rowB = {
    studentId: STUDENT_B,
    timeIn: "2026-11-25T08:00:00+08:00",
    timeOut: "2026-11-25T17:00:00+08:00",
    excluded: false,
  };

  // Valid batch with distinct students
  assert.equal(
    setServiceParticipantsSchema.safeParse({
      requestKey: VALID_KEY,
      sessionId: VALID_SESSION_ID,
      rows: [rowA, rowB],
    }).success,
    true
  );

  // Rejects empty batch
  assert.equal(
    setServiceParticipantsSchema.safeParse({
      requestKey: VALID_KEY,
      sessionId: VALID_SESSION_ID,
      rows: [],
    }).success,
    false
  );

  // Rejects duplicate studentId and attaches error path to the duplicate row
  const duplicateResult = setServiceParticipantsSchema.safeParse({
    requestKey: VALID_KEY,
    sessionId: VALID_SESSION_ID,
    rows: [rowA, { ...rowA }],
  });
  assert.equal(duplicateResult.success, false);
  if (!duplicateResult.success) {
    const issue = duplicateResult.error.issues.find(
      (i) => i.message === "Duplicate student in participant list."
    );
    assert.ok(issue);
    assert.deepEqual(issue.path, ["rows", 1, "studentId"]);
  }
});
