import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { confirmCouncilClearanceSchema } from "./schemas.ts";

describe("Task T-052 / FL-040: Council Clearance Schemas", () => {
  const validStudentId = "11111111-1111-4111-8111-111111111111";
  const validSemesterId = "22222222-2222-4222-8222-222222222222";

  test("accepts valid student and semester UUIDs", () => {
    const parsed = confirmCouncilClearanceSchema.safeParse({
      studentId: validStudentId,
      semesterId: validSemesterId,
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
