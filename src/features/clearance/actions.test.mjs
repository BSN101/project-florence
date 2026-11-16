import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { executeConfirmCouncilClearance } from "./command.ts";

describe("Task T-052 / FL-040: Council Clearance Action Handler", () => {
  const actorId = "11111111-1111-4111-8111-111111111111";
  const studentId = "22222222-2222-4222-8222-222222222222";
  const semesterId = "33333333-3333-4333-8333-333333333333";

  test("rejects invalid input schema without calling RPC", async () => {
    let rpcCalled = false;
    const result = await executeConfirmCouncilClearance({
      actor: { id: actorId, councilRole: "executive" },
      rpcClient: {
        rpc: async () => {
          rpcCalled = true;
          return { data: null, error: null };
        },
      },
      input: { studentId: "invalid", semesterId },
      revalidate: () => {},
    });

    assert.equal(result.success, false);
    assert.equal(rpcCalled, false);
  });

  test("rejects self-clearance without calling RPC", async () => {
    let rpcCalled = false;
    const result = await executeConfirmCouncilClearance({
      actor: { id: actorId, councilRole: "executive" },
      rpcClient: {
        rpc: async () => {
          rpcCalled = true;
          return { data: null, error: null };
        },
      },
      input: { studentId: actorId, semesterId },
      revalidate: () => {},
    });

    assert.equal(result.success, false);
    assert.equal(result.error, "Self-clearance prohibited");
    assert.equal(rpcCalled, false);
  });

  test("rejects unauthorized council role without calling RPC", async () => {
    let rpcCalled = false;
    const result = await executeConfirmCouncilClearance({
      actor: { id: actorId, councilRole: "representative" },
      rpcClient: {
        rpc: async () => {
          rpcCalled = true;
          return { data: null, error: null };
        },
      },
      input: { studentId, semesterId },
      revalidate: () => {},
    });

    assert.equal(result.success, false);
    assert.equal(rpcCalled, false);
  });

  test("executes confirm_clearance RPC with valid inputs and revalidates", async () => {
    let rpcParams = null;
    let revalidated = false;

    const mockResult = {
      clearance_id: "44444444-4444-4444-8444-444444444444",
      confirmed_at: "2026-11-16T12:00:00Z",
    };

    const result = await executeConfirmCouncilClearance({
      actor: { id: actorId, councilRole: "executive" },
      rpcClient: {
        rpc: async (fn, params) => {
          assert.equal(fn, "confirm_clearance");
          rpcParams = params;
          return { data: mockResult, error: null };
        },
      },
      input: { studentId, semesterId },
      revalidate: () => {
        revalidated = true;
      },
    });

    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.clearanceId, mockResult.clearance_id);
      assert.equal(result.confirmedAt, mockResult.confirmed_at);
    }

    assert.ok(rpcParams);
    assert.equal(rpcParams.p_actor, actorId);
    assert.equal(rpcParams.p_student, studentId);
    assert.equal(rpcParams.p_semester, semesterId);
    assert.equal(rpcParams.p_component, "council");
    assert.ok(rpcParams.p_key); // Idempotency key present
    assert.equal(revalidated, true);
  });

  test("handles SQLSTATE 42501 database self-clearance rejection safely", async () => {
    const result = await executeConfirmCouncilClearance({
      actor: { id: actorId, councilRole: "operations" },
      rpcClient: {
        rpc: async () => ({
          data: null,
          error: { code: "42501", message: "Self clearance forbidden" },
        }),
      },
      input: { studentId, semesterId },
      revalidate: () => {},
    });

    assert.equal(result.success, false);
    assert.equal(result.error, "Self-clearance prohibited");
  });
});
