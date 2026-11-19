import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  canDecideTransferForStudent,
  sanitizeTransferDecisionError,
} from "./contracts.ts";
import { transferDecisionSchema } from "./schemas.ts";

const paymentId = "11111111-1111-4111-8111-111111111111";
const receiptId = "22222222-2222-4222-8222-222222222222";
const requestKey = "33333333-3333-4333-8333-333333333333";

const earlier = "2020-01-01T08:00:00+08:00";
const later = "2020-01-02T08:00:00+08:00";

const base = { paymentId, requestKey, factsConfirmed: true };

describe("Task T-036 / FL-025: Transfer decision rules", () => {
  describe("transferDecisionSchema", () => {
    test("accepts a verified receipt with an actual receipt time", () => {
      const res = transferDecisionSchema.safeParse({
        ...base,
        mode: "received",
        receivedAt: earlier,
      });
      assert.equal(res.success, true);
    });

    test("rejects a future receipt time", () => {
      const res = transferDecisionSchema.safeParse({
        ...base,
        mode: "received",
        receivedAt: "2999-01-01T00:00:00Z",
      });
      assert.equal(res.success, false);
    });

    test("requires the operator to confirm the facts", () => {
      for (const factsConfirmed of [false, undefined]) {
        const res = transferDecisionSchema.safeParse({
          ...base,
          factsConfirmed,
          mode: "no_receipt",
          reason: "No money arrived",
        });
        assert.equal(res.success, false);
      }
    });

    test("no_receipt requires a non-blank reason", () => {
      assert.equal(
        transferDecisionSchema.safeParse({ ...base, mode: "no_receipt", reason: "   " }).success,
        false
      );
      assert.equal(
        transferDecisionSchema.safeParse({
          ...base,
          mode: "no_receipt",
          reason: "No money arrived",
        }).success,
        true
      );
    });

    test("duplicate requires an existing receipt", () => {
      assert.equal(
        transferDecisionSchema.safeParse({
          ...base,
          mode: "duplicate",
          reason: "Same transfer",
        }).success,
        false
      );
      assert.equal(
        transferDecisionSchema.safeParse({
          ...base,
          mode: "duplicate",
          reason: "Same transfer",
          existingReceiptId: receiptId,
        }).success,
        true
      );
    });

    test("returned requires receipt and refund times in order", () => {
      const valid = {
        ...base,
        mode: "returned",
        reason: "Sent twice, returned",
        receivedAt: earlier,
        refundedAt: later,
      };
      assert.equal(transferDecisionSchema.safeParse(valid).success, true);
      assert.equal(
        transferDecisionSchema.safeParse({ ...valid, refundedAt: "2019-12-31T00:00:00Z" }).success,
        false
      );
      assert.equal(
        transferDecisionSchema.safeParse({ ...valid, refundedAt: undefined }).success,
        false
      );
    });

    test("rejects unknown modes", () => {
      assert.equal(
        transferDecisionSchema.safeParse({ ...base, mode: "waived", reason: "x" }).success,
        false
      );
    });
  });

  describe("canDecideTransferForStudent", () => {
    test("blocks self-decision and missing identities", () => {
      assert.equal(canDecideTransferForStudent("a", "a"), false);
      assert.equal(canDecideTransferForStudent(null, "a"), false);
      assert.equal(canDecideTransferForStudent("a", undefined), false);
      assert.equal(canDecideTransferForStudent("a", "b"), true);
    });
  });

  describe("sanitizeTransferDecisionError", () => {
    test("maps known database errors to safe messages", () => {
      assert.match(
        sanitizeTransferDecisionError({ message: "Self payment decision forbidden" }),
        /own transfer/
      );
      assert.match(
        sanitizeTransferDecisionError({
          message: "Only a current pending transfer can be decided",
        }),
        /already decided/
      );
      assert.match(sanitizeTransferDecisionError({ code: "42501" }), /not authorized/);
    });

    test("never leaks unknown database text", () => {
      const msg = sanitizeTransferDecisionError({
        message: 'relation "f_cmd_private.requests" violates something',
      });
      assert.equal(msg.includes("f_cmd_private"), false);
    });
  });
});
