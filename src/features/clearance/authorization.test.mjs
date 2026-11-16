import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { canConfirmCouncilClearance, isAuthorizedCouncilClearanceRole } from "./authorization.ts";

describe("Task T-052 / FL-040: Council Clearance Authorization Rules", () => {
  test("isAuthorizedCouncilClearanceRole authorizes executive and operations only", () => {
    assert.equal(isAuthorizedCouncilClearanceRole("executive"), true);
    assert.equal(isAuthorizedCouncilClearanceRole("operations"), true);
    assert.equal(isAuthorizedCouncilClearanceRole("representative"), false);
    assert.equal(isAuthorizedCouncilClearanceRole("faculty"), false);
    assert.equal(isAuthorizedCouncilClearanceRole(null), false);
    assert.equal(isAuthorizedCouncilClearanceRole(undefined), false);
  });
  const actorId = "11111111-1111-4111-8111-111111111111";
  const studentId = "22222222-2222-4222-8222-222222222222";

  test("Council Executive is permitted to confirm clearance for another student", () => {
    const result = canConfirmCouncilClearance({
      actorProfileId: actorId,
      studentId,
      councilRole: "executive",
    });
    assert.equal(result.allowed, true);
  });

  test("Council Operations is permitted to confirm clearance for another student", () => {
    const result = canConfirmCouncilClearance({
      actorProfileId: actorId,
      studentId,
      councilRole: "operations",
    });
    assert.equal(result.allowed, true);
  });

  test("Council Representative is denied confirmation authorization", () => {
    const result = canConfirmCouncilClearance({
      actorProfileId: actorId,
      studentId,
      councilRole: "representative",
    });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, "unauthorized_role");
  });

  test("Non-council role or null role is denied authorization", () => {
    const resultNull = canConfirmCouncilClearance({
      actorProfileId: actorId,
      studentId,
      councilRole: null,
    });
    assert.equal(resultNull.allowed, false);

    const resultUndefined = canConfirmCouncilClearance({
      actorProfileId: actorId,
      studentId,
      councilRole: undefined,
    });
    assert.equal(resultUndefined.allowed, false);
  });

  test("Strict Anti-Self-Clearance: Executive cannot clear their own profile", () => {
    const result = canConfirmCouncilClearance({
      actorProfileId: actorId,
      studentId: actorId,
      councilRole: "executive",
    });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, "self_clearance_prohibited");
  });

  test("Strict Anti-Self-Clearance: Operations cannot clear their own profile", () => {
    const result = canConfirmCouncilClearance({
      actorProfileId: actorId,
      studentId: actorId,
      councilRole: "operations",
    });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, "self_clearance_prohibited");
  });
});
