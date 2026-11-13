import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, test } from "node:test";

import {
  getInvitationEligibilitySummary,
  isStudentEligibleForInvite,
} from "./contracts.ts";
import {
  bulkInviteSchema,
  cancelInvitationSchema,
  inviteStudentSchema,
} from "./schemas.ts";

function createMockStudent(overrides = {}) {
  return {
    enrollment_id: crypto.randomUUID(),
    student_id: crypto.randomUUID(),
    semester_id: crypto.randomUUID(),
    university_id: "26-1-00123",
    first_name: "Florence",
    middle_name: "Nightingale",
    last_name: "Santos",
    suffix: null,
    email: "florence.santos@university.edu.ph",
    year_level: 2,
    academic_status: "regular",
    account_status: "active",
    has_account: false,
    invitation_state: null,
    pending_invitation_id: null,
    invitation_expires_at: null,
    ...overrides,
  };
}

describe("Task T-018 / FL-008: Student Invitation Eligibility Rules", () => {
  test("marks student as eligible when uninvited, active, and has valid email", () => {
    const student = createMockStudent();
    assert.equal(isStudentEligibleForInvite(student), true);
  });

  test("marks student as eligible when previous invitation expired", () => {
    const student = createMockStudent({
      invitation_state: "expired",
      invitation_expires_at: "2026-11-01T00:00:00Z",
    });
    assert.equal(isStudentEligibleForInvite(student), true);
  });

  test("marks student as eligible when previous invitation was cancelled", () => {
    const student = createMockStudent({
      invitation_state: "cancelled",
    });
    assert.equal(isStudentEligibleForInvite(student), true);
  });

  test("disqualifies student if account is already linked (has_account: true)", () => {
    const student = createMockStudent({
      has_account: true,
      invitation_state: "accepted",
    });
    assert.equal(isStudentEligibleForInvite(student), false);
  });

  test("disqualifies student if an invitation is currently pending", () => {
    const student = createMockStudent({
      has_account: false,
      invitation_state: "pending",
      pending_invitation_id: crypto.randomUUID(),
      invitation_expires_at: "2026-11-20T00:00:00Z",
    });
    assert.equal(isStudentEligibleForInvite(student), false);
  });

  test("disqualifies student if email is missing or empty", () => {
    const noEmail = createMockStudent({ email: null });
    const emptyEmail = createMockStudent({ email: "   " });
    assert.equal(isStudentEligibleForInvite(noEmail), false);
    assert.equal(isStudentEligibleForInvite(emptyEmail), false);
  });

  test("disqualifies student if account_status is archived", () => {
    const archived = createMockStudent({ account_status: "archived" });
    assert.equal(isStudentEligibleForInvite(archived), false);
  });
});

describe("getInvitationEligibilitySummary", () => {
  test("computes accurate cohort counts for bulk invitation preview", () => {
    const roster = [
      createMockStudent({ university_id: "26-1-00001" }), // eligible
      createMockStudent({ university_id: "26-1-00002" }), // eligible
      createMockStudent({ university_id: "26-1-00003", invitation_state: "expired" }), // eligible (expired)
      createMockStudent({ university_id: "26-1-00004", has_account: true }), // registered
      createMockStudent({ university_id: "26-1-00005", invitation_state: "pending", pending_invitation_id: crypto.randomUUID() }), // pending
      createMockStudent({ university_id: "26-1-00006", email: null }), // missing email
      createMockStudent({ university_id: "26-1-00007", account_status: "archived" }), // archived
    ];

    const summary = getInvitationEligibilitySummary(roster);

    assert.equal(summary.totalStudents, 7);
    assert.equal(summary.eligibleCount, 3);
    assert.equal(summary.alreadyRegisteredCount, 1);
    assert.equal(summary.pendingCount, 1);
    assert.equal(summary.missingEmailCount, 1);
    assert.equal(summary.archivedCount, 1);
  });

  test("handles empty roster gracefully", () => {
    const summary = getInvitationEligibilitySummary([]);
    assert.equal(summary.totalStudents, 0);
    assert.equal(summary.eligibleCount, 0);
    assert.equal(summary.alreadyRegisteredCount, 0);
    assert.equal(summary.pendingCount, 0);
    assert.equal(summary.missingEmailCount, 0);
    assert.equal(summary.archivedCount, 0);
  });
});

describe("Invitation Schemas Validation", () => {
  test("inviteStudentSchema validates studentId and optional requestKey", () => {
    const valid = { studentId: crypto.randomUUID() };
    assert.equal(inviteStudentSchema.safeParse(valid).success, true);

    const withKey = {
      studentId: crypto.randomUUID(),
      requestKey: crypto.randomUUID(),
    };
    assert.equal(inviteStudentSchema.safeParse(withKey).success, true);

    const invalid = { studentId: "not-a-uuid" };
    assert.equal(inviteStudentSchema.safeParse(invalid).success, false);
  });

  test("cancelInvitationSchema validates invitationId", () => {
    const valid = { invitationId: crypto.randomUUID() };
    assert.equal(cancelInvitationSchema.safeParse(valid).success, true);

    const invalid = { invitationId: "invalid" };
    assert.equal(cancelInvitationSchema.safeParse(invalid).success, false);
  });

  test("bulkInviteSchema validates semesterId", () => {
    const valid = { semesterId: crypto.randomUUID() };
    assert.equal(bulkInviteSchema.safeParse(valid).success, true);

    const invalid = { semesterId: "invalid" };
    assert.equal(bulkInviteSchema.safeParse(invalid).success, false);
  });
});
