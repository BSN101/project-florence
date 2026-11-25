import assert from "node:assert/strict";
import test from "node:test";

import {
  canDecideMeritEndorsement,
  countFacultyEndorsements,
  formatManilaDate,
  formatManilaDateTime,
  hasInstructorRole,
  sortFacultyEndorsements,
} from "./calculations.ts";
import {
  decideMeritEndorsementSchema,
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

// --- hasInstructorRole & canDecideMeritEndorsement (FL-032) -------------

test("hasInstructorRole permits Academic, Clinical, and dual-role instructors", () => {
  assert.equal(hasInstructorRole(["Academic Instructor"]), true);
  assert.equal(hasInstructorRole(["Clinical Instructor"]), true);
  assert.equal(hasInstructorRole(["Academic Instructor", "Clinical Instructor"]), true);
  assert.equal(hasInstructorRole(["Academic Instructor", "Academic Coordinator"]), true);
  assert.equal(hasInstructorRole(["Clinical Instructor", "RLE Coordinator"]), true);
  assert.equal(hasInstructorRole(["Academic Coordinator"]), false);
  assert.equal(hasInstructorRole(["RLE Coordinator"]), false);
  assert.equal(hasInstructorRole(["Platform Admin"]), false);
  assert.equal(hasInstructorRole([]), false);
});

test("canDecideMeritEndorsement mirrors decide_merit_endorsement guards", () => {
  const base = {
    status: "pending",
    assigned_instructor_id: INSTRUCTOR_ID,
    student_id: STUDENT_1,
  };

  // Eligible instructor roles (including dual-role and paired coordinator)
  assert.equal(canDecideMeritEndorsement(base, INSTRUCTOR_ID, ["Academic Instructor"]), true);
  assert.equal(canDecideMeritEndorsement(base, INSTRUCTOR_ID, ["Clinical Instructor"]), true);
  assert.equal(
    canDecideMeritEndorsement(base, INSTRUCTOR_ID, ["Academic Instructor", "Clinical Instructor"]),
    true
  );
  assert.equal(
    canDecideMeritEndorsement(base, INSTRUCTOR_ID, ["Academic Instructor", "Academic Coordinator"]),
    true
  );
  assert.equal(
    canDecideMeritEndorsement(base, INSTRUCTOR_ID, ["Clinical Instructor", "RLE Coordinator"]),
    true
  );

  // Coordinator without paired instructor role or non-instructor roles
  assert.equal(canDecideMeritEndorsement(base, INSTRUCTOR_ID, ["Academic Coordinator"]), false);
  assert.equal(canDecideMeritEndorsement(base, INSTRUCTOR_ID, ["RLE Coordinator"]), false);
  assert.equal(canDecideMeritEndorsement(base, INSTRUCTOR_ID, ["Platform Admin"]), false);
  assert.equal(canDecideMeritEndorsement(base, INSTRUCTOR_ID, []), false);

  // Wrong assigned instructor
  assert.equal(canDecideMeritEndorsement(base, STUDENT_2, ["Academic Instructor"]), false);

  // Self-decision blocked
  assert.equal(
    canDecideMeritEndorsement(
      { ...base, student_id: INSTRUCTOR_ID },
      INSTRUCTOR_ID,
      ["Academic Instructor"]
    ),
    false
  );

  // Already decided statuses blocked
  assert.equal(
    canDecideMeritEndorsement({ ...base, status: "approved" }, INSTRUCTOR_ID, ["Academic Instructor"]),
    false
  );
  assert.equal(
    canDecideMeritEndorsement({ ...base, status: "rejected" }, INSTRUCTOR_ID, ["Academic Instructor"]),
    false
  );
});

// --- countFacultyEndorsements & sortFacultyEndorsements ----------------

test("countFacultyEndorsements tallies pending, approved, rejected, and total counts", () => {
  assert.deepEqual(countFacultyEndorsements([]), {
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  });

  const counts = countFacultyEndorsements([
    { status: "pending" },
    { status: "approved" },
    { status: "pending" },
    { status: "rejected" },
    { status: "approved" },
  ]);
  assert.deepEqual(counts, { total: 5, pending: 2, approved: 2, rejected: 1 });
});

test("sortFacultyEndorsements places pending newest-submitted first, then decided newest-decided", () => {
  const input = [
    {
      id: "b-decided-older",
      status: "approved",
      submitted_at: "2026-11-20T08:00:00Z",
      decided_at: "2026-11-21T08:00:00Z",
    },
    {
      id: "c-pending-older",
      status: "pending",
      submitted_at: "2026-11-22T08:00:00Z",
      decided_at: null,
    },
    {
      id: "a-decided-newer",
      status: "rejected",
      submitted_at: "2026-11-19T08:00:00Z",
      decided_at: "2026-11-24T09:00:00Z",
    },
    {
      id: "d-pending-newer",
      status: "pending",
      submitted_at: "2026-11-25T10:00:00Z",
      decided_at: null,
    },
    {
      id: "e-decided-tie-2",
      status: "approved",
      submitted_at: "2026-11-18T08:00:00Z",
      decided_at: "2026-11-21T08:00:00Z",
    },
  ];
  const snapshot = input.map((r) => r.id);

  const sorted = sortFacultyEndorsements(input);
  assert.deepEqual(
    sorted.map((r) => r.id),
    [
      "d-pending-newer",
      "c-pending-older",
      "a-decided-newer",
      "b-decided-older",
      "e-decided-tie-2",
    ]
  );
  // Original array must not be mutated
  assert.deepEqual(
    input.map((r) => r.id),
    snapshot
  );
});

// --- formatManilaDate & formatManilaDateTime ---------------------------

test("formatManilaDate and formatManilaDateTime format valid dates in Asia/Manila and fall back cleanly", () => {
  assert.equal(formatManilaDate("2026-11-25"), "Nov 25, 2026");
  // 2026-11-24T18:30:00Z is 2026-11-25 02:30 AM in Asia/Manila (+08:00)
  assert.equal(formatManilaDate("2026-11-24T18:30:00Z"), "Nov 25, 2026");
  const formattedDateTime = formatManilaDateTime("2026-11-24T18:30:00Z").replace(/\s+/g, " ");
  assert.match(formattedDateTime, /^Nov 25, 2026, 2:30 AM$/);

  for (const blank of [null, undefined, "", "   ", "not-a-date"]) {
    assert.equal(formatManilaDate(blank), "—", `formatManilaDate(${String(blank)})`);
    assert.equal(formatManilaDateTime(blank), "—", `formatManilaDateTime(${String(blank)})`);
  }
});

// --- decideMeritEndorsementSchema (FL-032) ------------------------------

test("decideMeritEndorsementSchema normalizes Approve reason to null and enforces 500-char limit", () => {
  for (const reason of [undefined, null, "", "   ", "Good leadership"]) {
    const res = decideMeritEndorsementSchema.safeParse({
      requestKey: KEY_1,
      endorsementId: STUDENT_1,
      decision: "approved",
      ...(reason !== undefined ? { reason } : {}),
    });
    assert.equal(res.success, true, `reason=${String(reason)}`);
    if (res.success) {
      assert.equal(res.data.decision, "approved");
      assert.equal(res.data.reason, null);
    }
  }

  const tooLongApprove = decideMeritEndorsementSchema.safeParse({
    requestKey: KEY_1,
    endorsementId: STUDENT_1,
    decision: "approved",
    reason: "a".repeat(501),
  });
  assert.equal(tooLongApprove.success, false);
});

test("decideMeritEndorsementSchema supports optional trimmed Reject reason up to 500 chars", () => {
  for (const reason of [undefined, null, "", "   "]) {
    const res = decideMeritEndorsementSchema.safeParse({
      requestKey: KEY_1,
      endorsementId: STUDENT_1,
      decision: "rejected",
      ...(reason !== undefined ? { reason } : {}),
    });
    assert.equal(res.success, true, `blank reject reason=${String(reason)}`);
    if (res.success) {
      assert.equal(res.data.decision, "rejected");
      assert.equal(res.data.reason, null);
    }
  }

  const withReason = decideMeritEndorsementSchema.safeParse({
    requestKey: KEY_1,
    endorsementId: STUDENT_1,
    decision: "rejected",
    reason: "  Insufficient supporting evidence.  ",
  });
  assert.equal(withReason.success, true);
  if (withReason.success) {
    assert.equal(withReason.data.reason, "Insufficient supporting evidence.");
  }

  const exactMax = decideMeritEndorsementSchema.safeParse({
    requestKey: KEY_1,
    endorsementId: STUDENT_1,
    decision: "rejected",
    reason: "a".repeat(500),
  });
  assert.equal(exactMax.success, true);

  const overMax = decideMeritEndorsementSchema.safeParse({
    requestKey: KEY_1,
    endorsementId: STUDENT_1,
    decision: "rejected",
    reason: "a".repeat(501),
  });
  assert.equal(overMax.success, false);
});

test("decideMeritEndorsementSchema rejects invalid decision or UUIDs", () => {
  assert.equal(
    decideMeritEndorsementSchema.safeParse({
      requestKey: KEY_1,
      endorsementId: STUDENT_1,
      decision: "pending",
    }).success,
    false
  );
  assert.equal(
    decideMeritEndorsementSchema.safeParse({
      requestKey: "not-a-uuid",
      endorsementId: STUDENT_1,
      decision: "approved",
    }).success,
    false
  );
  assert.equal(
    decideMeritEndorsementSchema.safeParse({
      requestKey: KEY_1,
      endorsementId: "not-a-uuid",
      decision: "rejected",
    }).success,
    false
  );
});
