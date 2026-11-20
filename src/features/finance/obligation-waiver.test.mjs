import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  calculateObligationsStanding,
  calculateStudentFinancialSummary,
  determineObligationStatus,
  scopeFinancialRecordsForSemester,
} from "./calculations.ts";
import {
  canWaiveObligationForStudent,
  isAuthorizedCouncilFinancialViewer,
  isObligationWaivable,
  sanitizeWaiveObligationError,
} from "./contracts.ts";
import { waiveObligationSchema } from "./schemas.ts";

const validStudentId = "11111111-1111-4111-8111-111111111111";
const validOfficerId = "22222222-2222-4222-8222-222222222222";
const validSemesterId = "33333333-3333-4333-8333-333333333333";
const priorSemesterId = "44444444-4444-4444-8444-444444444444";
const validObligationId1 = "55555555-5555-4555-8555-555555555555";
const validObligationId2 = "66666666-6666-4666-8666-666666666666";
const validRequestKey = "77777777-7777-4777-8777-777777777777";
const validPaymentId = "88888888-8888-4888-8888-888888888888";
const validReceiptId = "99999999-9999-4999-8999-999999999999";

describe("Task T-037 / FL-026: Unpaid Obligation Waiver Rules", () => {
  describe("waiveObligationSchema validation", () => {
    test("accepts valid waiver payload and trims the attributable reason", () => {
      const parsed = waiveObligationSchema.safeParse({
        obligationId: validObligationId1,
        studentId: validStudentId,
        reason: "   Approved medical exemption for General Assembly   ",
        requestKey: validRequestKey,
      });
      assert.equal(parsed.success, true);
      if (parsed.success) {
        assert.equal(parsed.data.obligationId, validObligationId1);
        assert.equal(parsed.data.studentId, validStudentId);
        assert.equal(
          parsed.data.reason,
          "Approved medical exemption for General Assembly"
        );
        assert.equal(parsed.data.requestKey, validRequestKey);
      }
    });

    test("rejects empty or whitespace-only waiver reasons", () => {
      for (const badReason of ["", "   ", "\n\t"]) {
        const res = waiveObligationSchema.safeParse({
          obligationId: validObligationId1,
          studentId: validStudentId,
          reason: badReason,
          requestKey: validRequestKey,
        });
        assert.equal(res.success, false);
        if (!res.success) {
          assert.equal(
            res.error.flatten().fieldErrors.reason?.[0],
            "Enter the reason for the waiver"
          );
        }
      }
    });

    test("rejects waiver reasons exceeding 500 characters", () => {
      const res = waiveObligationSchema.safeParse({
        obligationId: validObligationId1,
        studentId: validStudentId,
        reason: "a".repeat(501),
        requestKey: validRequestKey,
      });
      assert.equal(res.success, false);
      if (!res.success) {
        assert.equal(
          res.error.flatten().fieldErrors.reason?.[0],
          "Reason cannot exceed 500 characters"
        );
      }
    });

    test("requires valid UUIDs for obligationId, studentId, and requestKey", () => {
      const base = {
        obligationId: validObligationId1,
        studentId: validStudentId,
        reason: "Cancelled duplicate fee assessment",
        requestKey: validRequestKey,
      };

      assert.equal(
        waiveObligationSchema.safeParse({ ...base, obligationId: "bad-uuid" })
          .success,
        false
      );
      assert.equal(
        waiveObligationSchema.safeParse({ ...base, studentId: "bad-uuid" })
          .success,
        false
      );
      assert.equal(
        waiveObligationSchema.safeParse({ ...base, requestKey: "bad-uuid" })
          .success,
        false
      );
      assert.equal(
        waiveObligationSchema.safeParse({
          obligationId: validObligationId1,
          studentId: validStudentId,
          reason: "Cancelled duplicate fee assessment",
        }).success,
        false
      );
    });
  });

  describe("Role, self-waiver, and obligation eligibility checks", () => {
    test("allows only Council Executive and Operations officers", () => {
      assert.equal(isAuthorizedCouncilFinancialViewer("executive"), true);
      assert.equal(isAuthorizedCouncilFinancialViewer("operations"), true);
      assert.equal(isAuthorizedCouncilFinancialViewer("representative"), false);
      assert.equal(isAuthorizedCouncilFinancialViewer("student"), false);
      assert.equal(isAuthorizedCouncilFinancialViewer("faculty"), false);
      assert.equal(isAuthorizedCouncilFinancialViewer(null), false);
      assert.equal(isAuthorizedCouncilFinancialViewer(undefined), false);
    });

    test("canWaiveObligationForStudent blocks self-waiver and missing IDs", () => {
      assert.equal(
        canWaiveObligationForStudent(validOfficerId, validStudentId),
        true
      );
      assert.equal(
        canWaiveObligationForStudent(validOfficerId, validOfficerId),
        false
      );
      assert.equal(canWaiveObligationForStudent(null, validStudentId), false);
      assert.equal(canWaiveObligationForStudent(validOfficerId, null), false);
      assert.equal(
        canWaiveObligationForStudent(undefined, validStudentId),
        false
      );
      assert.equal(canWaiveObligationForStudent("", validStudentId), false);
    });

    test("isObligationWaivable allows unpaid and pending_verification items, and blocks settled or already waived items", () => {
      assert.equal(isObligationWaivable({ status: "unpaid" }), true);
      assert.equal(
        isObligationWaivable({ status: "pending_verification" }),
        true
      );
      assert.equal(isObligationWaivable({ status: "settled" }), false);
      assert.equal(isObligationWaivable({ status: "waived" }), false);
      assert.equal(isObligationWaivable(null), false);
      assert.equal(isObligationWaivable(undefined), false);
    });
  });

  describe("sanitizeWaiveObligationError helper", () => {
    test("prioritizes self-waiver error even when SQLSTATE 42501 is present", () => {
      for (const message of [
        "Self debt waiver forbidden",
        "Self obligation waiver forbidden",
      ]) {
        const msg = sanitizeWaiveObligationError({
          code: "42501",
          message,
        });
        assert.equal(
          msg,
          "Officers are not permitted to waive their own obligations."
        );
      }
    });

    test("sanitizes generic 42501 authorization error", () => {
      const msg = sanitizeWaiveObligationError({
        code: "42501",
        message: "Council action not authorized",
      });
      assert.equal(msg, "You are not authorized to waive obligations.");
    });

    test("sanitizes missing waiver reason error", () => {
      const msg = sanitizeWaiveObligationError({
        message: "Waiver reason required",
      });
      assert.equal(msg, "Enter the reason for the waiver.");
    });

    test("sanitizes already settled or already waived errors", () => {
      for (const message of [
        "Only unpaid, unwaived obligations may be waived",
        "Paid obligation cannot be waived",
      ]) {
        const msg = sanitizeWaiveObligationError({ message });
        assert.equal(
          msg,
          "This obligation has already been settled or waived. Refresh the page to see its latest status."
        );
      }
    });

    test("sanitizes unknown obligation errors", () => {
      for (const message of [
        "Unknown obligation",
        "A nonempty unique obligation UUID array (maximum 10000) is required",
      ]) {
        const msg = sanitizeWaiveObligationError({ message });
        assert.equal(
          msg,
          "This obligation could not be found. Refresh the page and try again."
        );
      }
    });

    test("sanitizes request key reuse and incomplete command receipt errors", () => {
      assert.equal(
        sanitizeWaiveObligationError({
          message: "Request key reused with different command, actor or input",
        }),
        "This waiver request conflicted with a previous attempt. Please try again."
      );
      assert.equal(
        sanitizeWaiveObligationError({
          message: "Incomplete command receipt",
        }),
        "This waiver could not be confirmed. Refresh the page to check the obligation's status before retrying."
      );
    });

    test("returns safe fallback on unknown database errors without leaking internals", () => {
      const msg = sanitizeWaiveObligationError({
        code: "42P01",
        message: 'relation "obligations" does not exist',
      });
      assert.equal(
        msg,
        "Unable to waive obligation. Please review the details and try again."
      );
      assert.equal(msg.includes("relation"), false);
    });
  });

  describe("Financial ledger effects of waiving an obligation", () => {
    test("waiving an unpaid obligation reduces what is owed, increases totalWaivedAmount, and leaves settled revenue untouched", () => {
      const settledFee = {
        id: validObligationId1,
        semester_id: validSemesterId,
        kind: "fee",
        consequence_outcome: null,
        description: "Council Membership Fee",
        amount: 250,
        waived_at: null,
        waiver_reason: null,
      };
      const waivedFine = {
        id: validObligationId2,
        semester_id: validSemesterId,
        kind: "fine",
        consequence_outcome: "absence",
        description: "General Assembly Absence Fine",
        amount: 100,
        waived_at: "2026-11-20T05:00:00Z",
        waiver_reason: "Approved medical excuse",
      };

      const payments = [
        {
          id: validPaymentId,
          status: "verified",
          record_status: "current",
          is_receipt_record: true,
          receipt_id: validReceiptId,
        },
      ];
      const paymentItems = [
        { payment_id: validPaymentId, obligation_id: validObligationId1 },
      ];

      const standing = calculateObligationsStanding({
        obligations: [settledFee, waivedFine],
        paymentItems,
        payments,
        refunds: [],
        targetSemesterId: validSemesterId,
      });

      assert.equal(standing[0].status, "settled");
      assert.equal(standing[1].status, "waived");

      const summary = calculateStudentFinancialSummary({
        obligationsWithStanding: standing,
        targetSemesterId: validSemesterId,
      });

      assert.equal(summary.totalGrossObligationsAmount, 350);
      assert.equal(summary.totalSettledAmount, 250);
      assert.equal(summary.totalWaivedAmount, 100);
      assert.equal(summary.currentSemesterPayable, 0);
      assert.equal(summary.totalOutstandingPayable, 0);
    });

    test("waiving an obligation with a pending transfer marks it waived and clears pending verification totals", () => {
      const status = determineObligationStatus({
        obligation: {
          id: validObligationId1,
          waived_at: "2026-11-20T05:00:00Z",
        },
        obligationPayments: [
          {
            id: "pay-pending",
            status: "pending",
            record_status: "current",
            is_receipt_record: false,
            receipt_id: null,
          },
        ],
        refundedReceiptIds: new Set(),
      });
      assert.equal(status, "waived");

      const summary = calculateStudentFinancialSummary({
        obligationsWithStanding: [
          {
            id: validObligationId1,
            semester_id: validSemesterId,
            kind: "fee",
            consequence_outcome: null,
            description: "Cancelled Publication Fee",
            amount: 150,
            waived_at: "2026-11-20T05:00:00Z",
            waiver_reason: "Fee publication cancelled",
            status,
          },
        ],
        targetSemesterId: validSemesterId,
      });

      assert.equal(summary.totalPendingVerificationAmount, 0);
      assert.equal(summary.totalOutstandingPayable, 0);
      assert.equal(summary.totalWaivedAmount, 150);
    });

    test("waiving a prior-semester carryover obligation removes it from prior overdue balances in the current semester", () => {
      const priorWaived = {
        id: "ob-prior",
        semester_id: priorSemesterId,
        kind: "fine",
        consequence_outcome: "late",
        description: "Prior Term Late Fine",
        amount: 75,
        waived_at: "2026-11-20T05:00:00Z",
        waiver_reason: "Approved appeal",
      };

      const allWithStanding = calculateObligationsStanding({
        obligations: [priorWaived],
        paymentItems: [],
        payments: [],
        refunds: [],
        targetSemesterId: validSemesterId,
        priorSemesterIds: new Set([priorSemesterId]),
      });

      const scoped = scopeFinancialRecordsForSemester({
        obligationsWithStanding: allWithStanding,
        payments: [],
        targetSemesterId: validSemesterId,
        priorSemesterIds: new Set([priorSemesterId]),
      });

      // Closed (waived) prior-semester obligations no longer carry over into current-semester dues.
      assert.equal(scoped.obligations.length, 0);

      const summary = calculateStudentFinancialSummary({
        obligationsWithStanding: scoped.obligations,
        targetSemesterId: validSemesterId,
      });
      assert.equal(summary.priorSemestersOverduePayable, 0);
      assert.equal(summary.totalOutstandingPayable, 0);
    });
  });
});
