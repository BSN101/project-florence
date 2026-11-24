import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  calculateObligationsStanding,
  calculatePaymentMoneyTotals,
  calculateStudentFinancialSummary,
  mapPaymentHistory,
  scopeFinancialRecordsForSemester,
} from "./calculations.ts";
import {
  canRecordRefundForStudent,
  isAuthorizedCouncilFinancialViewer,
  isPaymentRefundable,
  sanitizeRecordRefundError,
} from "./contracts.ts";
import { recordRefundSchema } from "./schemas.ts";

const validStudentId = "11111111-1111-4111-8111-111111111111";
const validOfficerId = "22222222-2222-4222-8222-222222222222";
const currentSemesterId = "33333333-3333-4333-8333-333333333333";
const priorSemesterId = "44444444-4444-4444-8444-444444444444";
const obligationId1 = "55555555-5555-4555-8555-555555555555";
const obligationId2 = "66666666-6666-4666-8666-666666666666";
const obligationId3 = "77777777-7777-4777-8777-777777777777";
const requestKey = "88888888-8888-4888-8888-888888888888";
const receiptId1 = "99999999-9999-4999-8999-999999999999";
const receiptId2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const paymentId1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const paymentId2 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const pastIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const futureIso = new Date(Date.now() + 60 * 60 * 1000).toISOString();

describe("Task T-038 / FL-027: Completed Refund Recording Rules", () => {
  describe("recordRefundSchema validation", () => {
    test("accepts valid completed refund payload and trims reason", () => {
      const parsed = recordRefundSchema.safeParse({
        receiptId: receiptId1,
        refundedAt: pastIso,
        reason: "   Returned overpaid cash outside Florence   ",
        factsConfirmed: true,
        requestKey,
      });

      assert.equal(parsed.success, true);
      if (parsed.success) {
        assert.equal(parsed.data.receiptId, receiptId1);
        assert.equal(parsed.data.refundedAt, pastIso);
        assert.equal(parsed.data.reason, "Returned overpaid cash outside Florence");
        assert.equal(parsed.data.factsConfirmed, true);
        assert.equal(parsed.data.requestKey, requestKey);
      }
    });

    test("rejects empty or whitespace-only reasons", () => {
      for (const badReason of ["", "   ", "\n\t"]) {
        const res = recordRefundSchema.safeParse({
          receiptId: receiptId1,
          refundedAt: pastIso,
          reason: badReason,
          factsConfirmed: true,
          requestKey,
        });
        assert.equal(res.success, false);
        if (!res.success) {
          assert.equal(
            res.error.flatten().fieldErrors.reason?.[0],
            "Enter the reason for the refund"
          );
        }
      }
    });

    test("rejects reasons exceeding 500 characters", () => {
      const res = recordRefundSchema.safeParse({
        receiptId: receiptId1,
        refundedAt: pastIso,
        reason: "x".repeat(501),
        factsConfirmed: true,
        requestKey,
      });
      assert.equal(res.success, false);
      if (!res.success) {
        assert.equal(
          res.error.flatten().fieldErrors.reason?.[0],
          "Reason cannot exceed 500 characters"
        );
      }
    });

    test("rejects future refundedAt timestamps and invalid datetime formats", () => {
      const futureRes = recordRefundSchema.safeParse({
        receiptId: receiptId1,
        refundedAt: futureIso,
        reason: "Returned cash",
        factsConfirmed: true,
        requestKey,
      });
      assert.equal(futureRes.success, false);
      if (!futureRes.success) {
        assert.equal(
          futureRes.error.flatten().fieldErrors.refundedAt?.[0],
          "Time cannot be in the future"
        );
      }

      const invalidRes = recordRefundSchema.safeParse({
        receiptId: receiptId1,
        refundedAt: "2026-11-23 12:00:00",
        reason: "Returned cash",
        factsConfirmed: true,
        requestKey,
      });
      assert.equal(invalidRes.success, false);
    });

    test("requires factsConfirmed to be explicitly true", () => {
      const res = recordRefundSchema.safeParse({
        receiptId: receiptId1,
        refundedAt: pastIso,
        reason: "Returned cash",
        factsConfirmed: false,
        requestKey,
      });
      assert.equal(res.success, false);
      if (!res.success) {
        assert.equal(
          res.error.flatten().fieldErrors.factsConfirmed?.[0],
          "Confirm that the full refund has already been returned"
        );
      }
    });

    test("rejects invalid UUIDs for receiptId and requestKey", () => {
      const base = {
        receiptId: receiptId1,
        refundedAt: pastIso,
        reason: "Returned cash",
        factsConfirmed: true,
        requestKey,
      };
      assert.equal(
        recordRefundSchema.safeParse({ ...base, receiptId: "not-a-uuid" }).success,
        false
      );
      assert.equal(
        recordRefundSchema.safeParse({ ...base, requestKey: "not-a-uuid" }).success,
        false
      );
    });
  });

  describe("Role, self-refund, and payment eligibility checks", () => {
    test("allows only Council Executive and Operations officers", () => {
      assert.equal(isAuthorizedCouncilFinancialViewer("executive"), true);
      assert.equal(isAuthorizedCouncilFinancialViewer("operations"), true);
      assert.equal(isAuthorizedCouncilFinancialViewer("representative"), false);
      assert.equal(isAuthorizedCouncilFinancialViewer("student"), false);
      assert.equal(isAuthorizedCouncilFinancialViewer("faculty"), false);
      assert.equal(isAuthorizedCouncilFinancialViewer(null), false);
      assert.equal(isAuthorizedCouncilFinancialViewer(undefined), false);
    });

    test("canRecordRefundForStudent blocks self-refund and missing IDs", () => {
      assert.equal(canRecordRefundForStudent(validOfficerId, validStudentId), true);
      assert.equal(canRecordRefundForStudent(validOfficerId, validOfficerId), false);
      assert.equal(canRecordRefundForStudent(null, validStudentId), false);
      assert.equal(canRecordRefundForStudent(validOfficerId, null), false);
      assert.equal(canRecordRefundForStudent("", validStudentId), false);
    });

    test("isPaymentRefundable permits only current, verified, unrefunded receipt records", () => {
      const eligible = {
        status: "verified",
        record_status: "current",
        is_receipt_record: true,
        receipt_id: receiptId1,
        is_refunded: false,
      };
      assert.equal(isPaymentRefundable(eligible), true);
      assert.equal(isPaymentRefundable({ ...eligible, is_refunded: true }), false);
      assert.equal(isPaymentRefundable({ ...eligible, status: "pending" }), false);
      assert.equal(isPaymentRefundable({ ...eligible, status: "rejected" }), false);
      assert.equal(isPaymentRefundable({ ...eligible, record_status: "superseded" }), false);
      assert.equal(isPaymentRefundable({ ...eligible, is_receipt_record: false }), false);
      assert.equal(isPaymentRefundable({ ...eligible, receipt_id: null }), false);
      assert.equal(isPaymentRefundable(null), false);
      assert.equal(isPaymentRefundable(undefined), false);
    });
  });

  describe("sanitizeRecordRefundError helper", () => {
    test("maps known record_refund RPC errors to user-safe messages", () => {
      assert.equal(
        sanitizeRecordRefundError({ code: "42501", message: "Self refund recording forbidden" }),
        "Officers are not permitted to record refunds for their own payments."
      );
      assert.equal(
        sanitizeRecordRefundError({ code: "23505", message: "Receipt already refunded" }),
        "This payment receipt has already been refunded. Refresh the page to see its latest status."
      );
      assert.equal(
        sanitizeRecordRefundError({ code: "55000", message: "Only verified payments can be refunded" }),
        "Only verified payments can be refunded."
      );
      assert.equal(
        sanitizeRecordRefundError({ code: "22023", message: "Invalid receipt/refund chronology" }),
        "The refund date and time cannot be earlier than when the payment was received."
      );
      assert.equal(
        sanitizeRecordRefundError({ code: "22023", message: "Payment receipt not found" }),
        "This payment receipt could not be found. Refresh the page and try again."
      );
      assert.equal(
        sanitizeRecordRefundError({
          code: "22023",
          message: "Actual completed refund time/reason/confirmation required",
        }),
        "Provide a valid refund date and time, reason, and confirmation that the full refund was returned."
      );
      assert.equal(
        sanitizeRecordRefundError({ code: "42501", message: "Council action not authorized" }),
        "You are not authorized to record payment refunds."
      );
      assert.equal(
        sanitizeRecordRefundError({ message: "Request key reused with different payload" }),
        "This refund request conflicted with a previous attempt. Please try again."
      );
      assert.equal(
        sanitizeRecordRefundError({ message: "Incomplete command receipt" }),
        "This refund could not be confirmed. Refresh the page to check the payment's status before retrying."
      );
    });

    test("never leaks unknown raw database error text", () => {
      const sanitized = sanitizeRecordRefundError({
        code: "XX000",
        message: "relation public.payment_refunds violates constraint xyz",
      });
      assert.equal(
        sanitized,
        "Unable to record refund. Please review the details and try again."
      );
    });
  });

  describe("Retained money totals and payable restoration", () => {
    test("preserves gross received, refunds, and net totals while restoring active obligations to unpaid", () => {
      const obligations = [
        {
          id: obligationId1,
          semester_id: currentSemesterId,
          kind: "fee",
          consequence_outcome: null,
          description: "Org Fee",
          amount: 150.25,
          waived_at: null,
          waiver_reason: null,
        },
        {
          id: obligationId2,
          semester_id: currentSemesterId,
          kind: "fine",
          consequence_outcome: "absent",
          description: "GA Absence Fine",
          amount: 99.9,
          waived_at: null,
          waiver_reason: null,
        },
      ];

      const rawPayments = [
        {
          id: paymentId1,
          student_id: validStudentId,
          semester_id: currentSemesterId,
          method: "cash",
          status: "verified",
          record_status: "current",
          receipt_id: receiptId1,
          is_receipt_record: true,
          destination_label: null,
          destination_account_name: null,
          destination_account_reference: null,
          reference_number: null,
          amount: 150.25,
          submitted_at: "2026-11-10T08:00:00Z",
          decided_at: "2026-11-10T08:00:00Z",
          decision_reason: null,
        },
        {
          id: paymentId2,
          student_id: validStudentId,
          semester_id: currentSemesterId,
          method: "transfer",
          status: "verified",
          record_status: "current",
          receipt_id: receiptId2,
          is_receipt_record: true,
          destination_label: "GCash",
          destination_account_name: "Florence Treasury",
          destination_account_reference: "0917-123-4567",
          reference_number: "REF1234567",
          amount: 99.9,
          submitted_at: "2026-11-11T09:00:00Z",
          decided_at: "2026-11-11T10:00:00Z",
          decision_reason: null,
        },
      ];

      const paymentItems = [
        { payment_id: paymentId1, obligation_id: obligationId1 },
        { payment_id: paymentId2, obligation_id: obligationId2 },
      ];

      const refunds = [
        {
          receipt_id: receiptId2,
          refunded_at: "2026-11-12T10:00:00Z",
          reason: "Returned full transfer amount in cash",
        },
      ];

      const standing = calculateObligationsStanding({
        obligations,
        paymentItems,
        payments: rawPayments,
        refunds,
        targetSemesterId: currentSemesterId,
      });

      const mappedPayments = mapPaymentHistory({
        payments: rawPayments,
        refunds,
        paymentItems,
        obligations,
      });

      const summary = calculateStudentFinancialSummary({
        obligationsWithStanding: standing,
        targetSemesterId: currentSemesterId,
        payments: mappedPayments,
      });

      // Obligation 1 remains settled; Obligation 2 is restored to unpaid (not waived).
      assert.equal(standing.find((o) => o.id === obligationId1)?.status, "settled");
      assert.equal(standing.find((o) => o.id === obligationId2)?.status, "unpaid");

      // Retained money totals use exact cent arithmetic: 150.25 + 99.90 = 250.15; 250.15 - 99.90 = 150.25.
      assert.equal(summary.totalGrossReceivedAmount, 250.15);
      assert.equal(summary.totalRefundedAmount, 99.9);
      assert.equal(summary.totalNetReceivedAmount, 150.25);

      // Payable balance reflects the restored obligation; waived remains 0.
      assert.equal(summary.totalSettledAmount, 150.25);
      assert.equal(summary.totalOutstandingPayable, 99.9);
      assert.equal(summary.totalWaivedAmount, 0);
    });

    test("excludes superseded corrections, pending transfers, and non-authoritative duplicates from money totals", () => {
      const totals = calculatePaymentMoneyTotals([
        // Superseded correction row for receiptId1 — must not be counted.
        {
          record_status: "superseded",
          is_receipt_record: true,
          receipt_id: receiptId1,
          amount: 200,
          is_refunded: false,
        },
        // Current authoritative representation for receiptId1 — counted once.
        {
          record_status: "current",
          is_receipt_record: true,
          receipt_id: receiptId1,
          amount: 200,
          is_refunded: false,
        },
        // Duplicate link to receiptId1 — non-authoritative, must not be counted.
        {
          record_status: "current",
          is_receipt_record: false,
          receipt_id: receiptId1,
          amount: 200,
          is_refunded: false,
        },
        // Pending transfer — no receipt, must not be counted.
        {
          record_status: "current",
          is_receipt_record: false,
          receipt_id: null,
          amount: 150,
          is_refunded: false,
        },
        // Verified then refunded receiptId2 — counted in both gross and refunds.
        {
          record_status: "current",
          is_receipt_record: true,
          receipt_id: receiptId2,
          amount: 75.5,
          is_refunded: true,
        },
      ]);

      assert.equal(totals.totalGrossReceivedAmount, 275.5);
      assert.equal(totals.totalRefundedAmount, 75.5);
      assert.equal(totals.totalNetReceivedAmount, 200);
    });

    test("keeps already-waived obligations waived and restores prior-semester refunded obligations as overdue carryover", () => {
      const obligations = [
        {
          id: obligationId1,
          semester_id: currentSemesterId,
          kind: "fee",
          consequence_outcome: null,
          description: "Waived Fee",
          amount: 100,
          waived_at: "2026-11-13T00:00:00Z",
          waiver_reason: "Separate waiver after refund",
        },
        {
          id: obligationId3,
          semester_id: priorSemesterId,
          kind: "fine",
          consequence_outcome: "absent",
          description: "Prior Term Fine",
          amount: 250,
          waived_at: null,
          waiver_reason: null,
        },
      ];

      const rawPayments = [
        {
          id: paymentId1,
          student_id: validStudentId,
          semester_id: currentSemesterId,
          method: "cash",
          status: "verified",
          record_status: "current",
          receipt_id: receiptId1,
          is_receipt_record: true,
          destination_label: null,
          destination_account_name: null,
          destination_account_reference: null,
          reference_number: null,
          amount: 100,
          submitted_at: "2026-11-10T08:00:00Z",
          decided_at: "2026-11-10T08:00:00Z",
          decision_reason: null,
        },
        {
          id: paymentId2,
          student_id: validStudentId,
          semester_id: priorSemesterId,
          method: "cash",
          status: "verified",
          record_status: "current",
          receipt_id: receiptId2,
          is_receipt_record: true,
          destination_label: null,
          destination_account_name: null,
          destination_account_reference: null,
          reference_number: null,
          amount: 250,
          submitted_at: "2026-08-10T08:00:00Z",
          decided_at: "2026-08-10T08:00:00Z",
          decision_reason: null,
        },
      ];

      const paymentItems = [
        { payment_id: paymentId1, obligation_id: obligationId1 },
        { payment_id: paymentId2, obligation_id: obligationId3 },
      ];

      const refunds = [
        { receipt_id: receiptId1, refunded_at: "2026-11-12T10:00:00Z", reason: "Refund 1" },
        { receipt_id: receiptId2, refunded_at: "2026-11-12T11:00:00Z", reason: "Refund 2" },
      ];

      const priorSemesterIds = new Set([priorSemesterId]);
      const standing = calculateObligationsStanding({
        obligations,
        paymentItems,
        payments: rawPayments,
        refunds,
        targetSemesterId: currentSemesterId,
        priorSemesterIds,
      });

      const mappedPayments = mapPaymentHistory({
        payments: rawPayments,
        refunds,
        paymentItems,
        obligations,
      });

      const scoped = scopeFinancialRecordsForSemester({
        obligationsWithStanding: standing,
        payments: mappedPayments,
        paymentItems,
        targetSemesterId: currentSemesterId,
        priorSemesterIds,
      });

      const summary = calculateStudentFinancialSummary({
        obligationsWithStanding: scoped.obligations,
        targetSemesterId: currentSemesterId,
        payments: scoped.payments,
      });

      assert.equal(
        scoped.obligations.find((o) => o.id === obligationId1)?.status,
        "waived"
      );
      assert.equal(
        scoped.obligations.find((o) => o.id === obligationId3)?.status,
        "unpaid"
      );
      assert.equal(summary.priorSemestersOverduePayable, 250);
      assert.equal(summary.totalOutstandingPayable, 250);
      assert.equal(summary.totalWaivedAmount, 100);
      // The prior-term refunded receipt rolls in with its carryover obligation but not into this term's money totals.
      assert.ok(scoped.payments.some((p) => p.receipt_id === receiptId2));
      assert.equal(summary.totalGrossReceivedAmount, 100);
      assert.equal(summary.totalRefundedAmount, 100);
      assert.equal(summary.totalNetReceivedAmount, 0);
    });
  });
});
