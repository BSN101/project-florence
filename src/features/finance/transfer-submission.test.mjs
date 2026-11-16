import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  hasSameSemesterObligations,
  sanitizeTransferSubmissionError,
} from "./contracts.ts";
import {
  PAYMENT_PROOF_MAX_BYTES,
  paymentProofFileIdSchema,
  submitTransferSchema,
} from "./schemas.ts";

const validSemesterId = "11111111-1111-4111-8111-111111111111";
const validObligationId1 = "22222222-2222-4222-8222-222222222222";
const validObligationId2 = "33333333-3333-4333-8333-333333333333";
const validAccountId = "44444444-4444-4444-8444-444444444444";
const validProofFileId = "55555555-5555-4555-8555-555555555555";
const validRequestKey = "66666666-6666-4666-8666-666666666666";

describe("Task T-034 / FL-023: Student Transfer Submission Rules", () => {
  describe("submitTransferSchema validation", () => {
    test("accepts valid submission payload", () => {
      const res = submitTransferSchema.safeParse({
        semesterId: validSemesterId,
        obligationIds: [validObligationId1, validObligationId2],
        paymentAccountId: validAccountId,
        referenceNumber: "GCASH-987654321",
        proofFileId: validProofFileId,
        requestKey: validRequestKey,
      });

      assert.equal(res.success, true);
      if (res.success) {
        assert.equal(res.data.semesterId, validSemesterId);
        assert.equal(res.data.referenceNumber, "GCASH-987654321");
        assert.equal(res.data.obligationIds.length, 2);
      }
    });

    test("trims reference number and accepts submission without optional requestKey", () => {
      const res = submitTransferSchema.safeParse({
        semesterId: validSemesterId,
        obligationIds: [validObligationId1],
        paymentAccountId: validAccountId,
        referenceNumber: "   REF-123456   ",
        proofFileId: validProofFileId,
      });

      assert.equal(res.success, true);
      if (res.success) {
        assert.equal(res.data.referenceNumber, "REF-123456");
        assert.equal(res.data.requestKey, undefined);
      }
    });

    test("rejects empty obligations array", () => {
      const res = submitTransferSchema.safeParse({
        semesterId: validSemesterId,
        obligationIds: [],
        paymentAccountId: validAccountId,
        referenceNumber: "REF-123456",
        proofFileId: validProofFileId,
      });

      assert.equal(res.success, false);
      if (!res.success) {
        assert.equal(
          res.error.flatten().fieldErrors.obligationIds?.[0],
          "Select at least one obligation to pay"
        );
      }
    });

    test("rejects duplicate obligation UUIDs", () => {
      const res = submitTransferSchema.safeParse({
        semesterId: validSemesterId,
        obligationIds: [validObligationId1, validObligationId1],
        paymentAccountId: validAccountId,
        referenceNumber: "REF-123456",
        proofFileId: validProofFileId,
      });

      assert.equal(res.success, false);
      if (!res.success) {
        assert.equal(
          res.error.flatten().fieldErrors.obligationIds?.[0],
          "Duplicate obligations are not permitted"
        );
      }
    });

    test("rejects empty or whitespace-only reference number", () => {
      assert.equal(
        submitTransferSchema.safeParse({
          semesterId: validSemesterId,
          obligationIds: [validObligationId1],
          paymentAccountId: validAccountId,
          referenceNumber: "",
          proofFileId: validProofFileId,
        }).success,
        false
      );

      assert.equal(
        submitTransferSchema.safeParse({
          semesterId: validSemesterId,
          obligationIds: [validObligationId1],
          paymentAccountId: validAccountId,
          referenceNumber: "    ",
          proofFileId: validProofFileId,
        }).success,
        false
      );
    });

    test("enforces reference number max length (120 characters)", () => {
      const exact120 = "R".repeat(120);
      const over120 = "R".repeat(121);

      assert.equal(
        submitTransferSchema.safeParse({
          semesterId: validSemesterId,
          obligationIds: [validObligationId1],
          paymentAccountId: validAccountId,
          referenceNumber: exact120,
          proofFileId: validProofFileId,
        }).success,
        true
      );

      assert.equal(
        submitTransferSchema.safeParse({
          semesterId: validSemesterId,
          obligationIds: [validObligationId1],
          paymentAccountId: validAccountId,
          referenceNumber: over120,
          proofFileId: validProofFileId,
        }).success,
        false
      );
    });

    test("rejects invalid UUID identifiers across fields", () => {
      const base = {
        semesterId: validSemesterId,
        obligationIds: [validObligationId1],
        paymentAccountId: validAccountId,
        referenceNumber: "REF-123456",
        proofFileId: validProofFileId,
        requestKey: validRequestKey,
      };

      assert.equal(
        submitTransferSchema.safeParse({ ...base, semesterId: "bad-uuid" }).success,
        false
      );
      assert.equal(
        submitTransferSchema.safeParse({ ...base, paymentAccountId: "bad-uuid" }).success,
        false
      );
      assert.equal(
        submitTransferSchema.safeParse({ ...base, proofFileId: "bad-uuid" }).success,
        false
      );
      assert.equal(
        submitTransferSchema.safeParse({ ...base, requestKey: "bad-uuid" }).success,
        false
      );
      assert.equal(
        submitTransferSchema.safeParse({ ...base, obligationIds: ["bad-uuid"] }).success,
        false
      );
    });
  });

  describe("Constants and proof schema", () => {
    test("PAYMENT_PROOF_MAX_BYTES matches 4 MB limit", () => {
      assert.equal(PAYMENT_PROOF_MAX_BYTES, 4 * 1024 * 1024);
    });

    test("paymentProofFileIdSchema validates UUID format", () => {
      assert.equal(paymentProofFileIdSchema.safeParse(validProofFileId).success, true);
      assert.equal(paymentProofFileIdSchema.safeParse("invalid-id").success, false);
    });
  });

  describe("hasSameSemesterObligations helper", () => {
    test("returns true when all obligations share the target semester", () => {
      const obligations = [
        { semester_id: validSemesterId },
        { semester_id: validSemesterId },
      ];
      assert.equal(hasSameSemesterObligations(obligations, validSemesterId), true);
    });

    test("returns false when any obligation belongs to a different semester", () => {
      const differentSemester = "77777777-7777-4777-8777-777777777777";
      const mixed = [
        { semester_id: validSemesterId },
        { semester_id: differentSemester },
      ];
      assert.equal(hasSameSemesterObligations(mixed, validSemesterId), false);
    });

    test("returns false for an empty obligations array", () => {
      assert.equal(hasSameSemesterObligations([], validSemesterId), false);
    });
  });

  describe("sanitizeTransferSubmissionError helper", () => {
    test("sanitizes authorization error (42501)", () => {
      const msg = sanitizeTransferSubmissionError({ code: "42501" });
      assert.equal(
        msg,
        "You are not authorized to submit transfer evidence for this account."
      );
    });

    test("sanitizes inactive payment destination error", () => {
      const msg = sanitizeTransferSubmissionError({
        message: "Active payment destination account required",
      });
      assert.equal(
        msg,
        "The selected payment destination account is no longer active. Please choose another account."
      );
    });

    test("sanitizes invalid or unowned payment proof error", () => {
      const msg = sanitizeTransferSubmissionError({
        message: "Valid payment proof upload required",
      });
      assert.equal(
        msg,
        "The uploaded transfer proof is invalid or unavailable. Please upload the receipt image again."
      );
    });

    test("sanitizes same-semester violation error", () => {
      const msg = sanitizeTransferSubmissionError({
        message: "Payment items must share beneficiary and semester",
      });
      assert.equal(msg, "All selected obligations must belong to the same semester.");
    });

    test("sanitizes waived or already-settled debt error", () => {
      const msg = sanitizeTransferSubmissionError({
        message: "Selected obligation is waived or already settled",
      });
      assert.equal(
        msg,
        "One or more selected obligations have already been settled or waived. Refresh the page and try again."
      );
    });

    test("sanitizes missing semester enrollment error", () => {
      const msg = sanitizeTransferSubmissionError({
        message: "Student enrollment in the specified semester required",
      });
      assert.equal(
        msg,
        "You must be enrolled in the selected semester to submit a payment for it."
      );
    });

    test("sanitizes reused request key conflict error", () => {
      const msg = sanitizeTransferSubmissionError({
        message: "Request key reused with different command, actor or input",
      });
      assert.equal(
        msg,
        "This submission request conflicted with a previous attempt. Please try again."
      );
    });

    test("returns safe fallback on unknown or internal database errors", () => {
      const fallback = sanitizeTransferSubmissionError({
        code: "XX000",
        message: 'relation "payments" does not exist',
      });
      assert.equal(
        fallback,
        "Unable to submit transfer evidence. Please review your details and try again."
      );
      assert.equal(fallback.includes("payments"), false);
    });
  });
});
