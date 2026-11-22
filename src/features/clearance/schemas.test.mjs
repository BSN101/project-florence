import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  confirmCouncilClearanceSchema,
  confirmFacultyClearanceSchema,
} from "./schemas.ts";

describe("Task T-052 / FL-040: Council Clearance Schemas", () => {
  const validStudentId = "11111111-1111-4111-8111-111111111111";
  const validSemesterId = "22222222-2222-4222-8222-222222222222";
  const requestKey = "33333333-3333-4333-8333-333333333333";

  test("accepts valid student, semester and request key UUIDs", () => {
    const parsed = confirmCouncilClearanceSchema.safeParse({
      studentId: validStudentId,
      semesterId: validSemesterId,
      requestKey,
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.studentId, validStudentId);
      assert.equal(parsed.data.semesterId, validSemesterId);
    }
  });

  test("rejects malformed studentId", () => {
    const parsed = confirmCouncilClearanceSchema.safeParse({
      studentId: "invalid-uuid",
      semesterId: validSemesterId,
    });
    assert.equal(parsed.success, false);
  });

  test("rejects malformed semesterId", () => {
    const parsed = confirmCouncilClearanceSchema.safeParse({
      studentId: validStudentId,
      semesterId: "not-a-uuid",
    });
    assert.equal(parsed.success, false);
  });

  test("rejects a missing or malformed request key", () => {
    assert.equal(confirmCouncilClearanceSchema.safeParse({ studentId: validStudentId, semesterId: validSemesterId }).success, false);
    assert.equal(
      confirmCouncilClearanceSchema.safeParse({ studentId: validStudentId, semesterId: validSemesterId, requestKey: "x" }).success,
      false
    );
  });

  test("rejects missing fields", () => {
    const parsedEmpty = confirmCouncilClearanceSchema.safeParse({});
    assert.equal(parsedEmpty.success, false);

    const parsedMissingStudent = confirmCouncilClearanceSchema.safeParse({
      semesterId: validSemesterId,
    });
    assert.equal(parsedMissingStudent.success, false);

    const parsedMissingSemester = confirmCouncilClearanceSchema.safeParse({
      studentId: validStudentId,
    });
    assert.equal(parsedMissingSemester.success, false);
  });
});

describe("Task T-053 / FL-041: Faculty Clearance Schemas", () => {
  const validStudentId = "11111111-1111-4111-8111-111111111111";
  const validSemesterId = "22222222-2222-4222-8222-222222222222";
  const requestKey = "33333333-3333-4333-8333-333333333333";

  test("accepts valid academic and rle component confirmation inputs", () => {
    const parsedAcademic = confirmFacultyClearanceSchema.safeParse({
      studentId: validStudentId,
      semesterId: validSemesterId,
      component: "academic",
      requestKey,
    });
    assert.equal(parsedAcademic.success, true);
    if (parsedAcademic.success) {
      assert.equal(parsedAcademic.data.component, "academic");
    }

    const parsedRle = confirmFacultyClearanceSchema.safeParse({
      studentId: validStudentId,
      semesterId: validSemesterId,
      component: "rle",
      requestKey,
    });
    assert.equal(parsedRle.success, true);
    if (parsedRle.success) {
      assert.equal(parsedRle.data.component, "rle");
    }
  });

  test("rejects invalid component (e.g. council or random string)", () => {
    const parsedCouncil = confirmFacultyClearanceSchema.safeParse({
      studentId: validStudentId,
      semesterId: validSemesterId,
      component: "council",
      requestKey,
    });
    assert.equal(parsedCouncil.success, false);

    const parsedInvalid = confirmFacultyClearanceSchema.safeParse({
      studentId: validStudentId,
      semesterId: validSemesterId,
      component: "invalid",
      requestKey,
    });
    assert.equal(parsedInvalid.success, false);
  });

  test("rejects missing or malformed requestKey", () => {
    const parsedMissing = confirmFacultyClearanceSchema.safeParse({
      studentId: validStudentId,
      semesterId: validSemesterId,
      component: "academic",
    });
    assert.equal(parsedMissing.success, false);

    const parsedMalformed = confirmFacultyClearanceSchema.safeParse({
      studentId: validStudentId,
      semesterId: validSemesterId,
      component: "academic",
      requestKey: "bad-key",
    });
    assert.equal(parsedMalformed.success, false);
  });
});

