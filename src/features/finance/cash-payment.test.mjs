import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  calculateObligationsStanding,
  calculateStudentFinancialSummary,
  determineObligationStatus,
  mapPaymentHistory,
} from "./calculations.ts";
import {
  canRecordCashForStudent,
  hasSameSemesterObligations,
  isAuthorizedCouncilFinancialViewer,
  sanitizeCashPaymentError,
} from "./contracts.ts";
import { recordCashPaymentSchema } from "./schemas.ts";

const validStudentId = "11111111-1111-4111-8111-111111111111";
const validOfficerId = "22222222-2222-4222-8222-222222222222";
const validSemesterId = "33333333-3333-4333-8333-333333333333";
const otherSemesterId = "44444444-4444-4444-8444-444444444444";
const validObligationId1 = "55555555-5555-4555-8555-555555555555";
const validObligationId2 = "66666666-6666-4666-8666-666666666666";
const validRequestKey = "77777777-7777-4777-8777-777777777777";
const validPaymentId = "88888888-8888-4888-8888-888888888888";
const validReceiptId = "99999999-9999-4999-8999-999999999999";

const pastManilaIso = "2026-11-10T09:30:00+08:00";
const pastUtcIso = "2026-11-10T01:30:00.000Z";

describe("Task T-035 / FL-024: Cash Payment Recording Rules", () => {
  describe("recordCashPaymentSchema validation", () => {
    test("accepts valid single- and multi-obligation cash payment payloads", () => {
      const single = recordCashPaymentSchema.safeParse({
        studentId: validStudentId,
        semesterId: validSemesterId,
        obligationIds: [validObligationId1],
        receivedAt: pastManilaIso,
        requestKey: validRequestKey,
      });
      assert.equal(single.success, true);

      const multiple = recordCashPaymentSchema.safeParse({
        studentId: validStudentId,
        semesterId: validSemesterId,
        obligationIds: [validObligationId1, validObligationId2],
        receivedAt: pastUtcIso,
        requestKey: validRequestKey,
      });
      assert.equal(multiple.success, true);
      if (multiple.success) {
        assert.equal(multiple.data.obligationIds.length, 2);
      }
    });

    test("requires a requestKey for idempotent retries", () => {
      const res = recordCashPaymentSchema.safeParse({
        studentId: validStudentId,
        semesterId: validSemesterId,
        obligationIds: [validObligationId1],
        receivedAt: pastManilaIso,
      });
      assert.equal(res.success, false);
    });

    test("rejects empty obligationIds array", () => {
      const res = recordCashPaymentSchema.safeParse({
        studentId: validStudentId,
        semesterId: validSemesterId,
        obligationIds: [],
        receivedAt: pastManilaIso,
        requestKey: validRequestKey,
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
      const res = recordCashPaymentSchema.safeParse({
        studentId: validStudentId,
        semesterId: validSemesterId,
        obligationIds: [validObligationId1, validObligationId1],
        receivedAt: pastManilaIso,
        requestKey: validRequestKey,
      });
      assert.equal(res.success, false);
      if (!res.success) {
        assert.equal(
          res.error.flatten().fieldErrors.obligationIds?.[0],
          "Duplicate obligations are not permitted"
        );
      }
    });

    test("rejects invalid UUID identifiers across fields", () => {
      const base = {
        studentId: validStudentId,
        semesterId: validSemesterId,
        obligationIds: [validObligationId1],
        receivedAt: pastManilaIso,
        requestKey: validRequestKey,
      };

      assert.equal(
        recordCashPaymentSchema.safeParse({ ...base, studentId: "bad-uuid" }).success,
        false
      );
      assert.equal(
        recordCashPaymentSchema.safeParse({ ...base, semesterId: "bad-uuid" }).success,
        false
      );
      assert.equal(
        recordCashPaymentSchema.safeParse({ ...base, obligationIds: ["bad-uuid"] }).success,
        false
      );
      assert.equal(
        recordCashPaymentSchema.safeParse({ ...base, requestKey: "bad-uuid" }).success,
        false
      );
    });

    test("rejects malformed or offset-less receivedAt strings", () => {
      for (const badDate of ["not-a-date", "2026-11-10T09:30:00", "2026-11-10", ""]) {
        const res = recordCashPaymentSchema.safeParse({
          studentId: validStudentId,
          semesterId: validSemesterId,
          obligationIds: [validObligationId1],
          receivedAt: badDate,
          requestKey: validRequestKey,
        });
        assert.equal(res.success, false, `Expected failure for ${badDate}`);
        if (!res.success) {
          assert.equal(
            res.error.flatten().fieldErrors.receivedAt?.[0],
            "Invalid receipt date and time"
          );
        }
      }
    });

    test("rejects future receivedAt timestamps", () => {
      const futureIso = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const res = recordCashPaymentSchema.safeParse({
        studentId: validStudentId,
        semesterId: validSemesterId,
        obligationIds: [validObligationId1],
        receivedAt: futureIso,
        requestKey: validRequestKey,
      });
      assert.equal(res.success, false);
      if (!res.success) {
        assert.equal(
          res.error.flatten().fieldErrors.receivedAt?.[0],
          "Receipt time cannot be in the future"
        );
      }
    });
  });

  describe("Role & self-recording authorization", () => {
    test("allows only Executive and Operations Council officers", () => {
      assert.equal(isAuthorizedCouncilFinancialViewer("executive"), true);
      assert.equal(isAuthorizedCouncilFinancialViewer("operations"), true);
      assert.equal(isAuthorizedCouncilFinancialViewer("representative"), false);
      assert.equal(isAuthorizedCouncilFinancialViewer("student"), false);
      assert.equal(isAuthorizedCouncilFinancialViewer(null), false);
      assert.equal(isAuthorizedCouncilFinancialViewer(undefined), false);
    });

    test("canRecordCashForStudent blocks self-recording and missing IDs", () => {
      assert.equal(canRecordCashForStudent(validOfficerId, validStudentId), true);
      assert.equal(canRecordCashForStudent(validOfficerId, validOfficerId), false);
      assert.equal(canRecordCashForStudent(null, validStudentId), false);
      assert.equal(canRecordCashForStudent(validOfficerId, null), false);
      assert.equal(canRecordCashForStudent(undefined, validStudentId), false);
      assert.equal(canRecordCashForStudent("", validStudentId), false);
    });
  });

  describe("Same-semester & pending-transfer settlement behavior", () => {
    test("hasSameSemesterObligations accepts single-semester items and rejects mixed or empty sets", () => {
      assert.equal(
        hasSameSemesterObligations(
          [{ semester_id: validSemesterId }, { semester_id: validSemesterId }],
          validSemesterId
        ),
        true
      );
      assert.equal(
        hasSameSemesterObligations(
          [{ semester_id: validSemesterId }, { semester_id: otherSemesterId }],
          validSemesterId
        ),
        false
      );
      assert.equal(hasSameSemesterObligations([], validSemesterId), false);
    });

    test("determineObligationStatus marks an obligation settled once cash is recorded even with an open pending transfer", () => {
      const pendingOnly = determineObligationStatus({
        obligation: { id: validObligationId1, waived_at: null },
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
      assert.equal(pendingOnly, "pending_verification");

      const afterCashRecorded = determineObligationStatus({
        obligation: { id: validObligationId1, waived_at: null },
        obligationPayments: [
          {
            id: "pay-pending",
            status: "pending",
            record_status: "current",
            is_receipt_record: false,
            receipt_id: null,
          },
          {
            id: validPaymentId,
            status: "verified",
            record_status: "current",
            is_receipt_record: true,
            receipt_id: validReceiptId,
          },
        ],
        refundedReceiptIds: new Set(),
      });
      assert.equal(afterCashRecorded, "settled");
    });
  });

  describe("sanitizeCashPaymentError helper", () => {
    test("prioritizes self-recording error even when SQLSTATE 42501 is present", () => {
      const msg = sanitizeCashPaymentError({
        code: "42501",
        message: "Self cash recording forbidden",
      });
      assert.equal(msg, "Officers are not permitted to record their own cash payments.");
    });

    test("sanitizes generic 42501 authorization error", () => {
      const msg = sanitizeCashPaymentError({
        code: "42501",
        message: "Council action not authorized",
      });
      assert.equal(msg, "You are not authorized to record cash payments.");
    });

    test("sanitizes invalid receipt timestamp error", () => {
      const msg = sanitizeCashPaymentError({
        message: "Actual receipt time required",
      });
      assert.equal(msg, "Enter a valid receipt date and time that is not in the future.");
    });

    test("sanitizes beneficiary and semester mismatch error", () => {
      const msg = sanitizeCashPaymentError({
        message: "Payment items must share beneficiary and semester",
      });
      assert.equal(msg, "All selected obligations must belong to the same student and semester.");
    });

    test("sanitizes waived and double-settlement errors", () => {
      for (const dbMsg of [
        "Selected obligation is waived or already settled",
        "Double settlement forbidden",
        "Cannot settle waived debt",
      ]) {
        const msg = sanitizeCashPaymentError({ message: dbMsg });
        assert.equal(
          msg,
          "One or more selected obligations have already been settled or waived. Refresh the page and try again."
        );
      }
    });

    test("sanitizes unknown obligation error", () => {
      const msg = sanitizeCashPaymentError({ message: "Unknown obligation" });
      assert.equal(
        msg,
        "One or more selected obligations could not be found. Refresh the page and try again."
      );
    });

    test("sanitizes missing semester enrollment error", () => {
      const msg = sanitizeCashPaymentError({
        message: "Student enrollment in the specified semester required",
      });
      assert.equal(
        msg,
        "The student must be enrolled in the selected semester to record a payment for it."
      );
    });

    test("sanitizes request key reuse conflict error", () => {
      const msg = sanitizeCashPaymentError({
        message: "Request key reused with different command, actor or input",
      });
      assert.equal(
        msg,
        "This payment request conflicted with a previous attempt. Please try again."
      );
    });

    test("returns safe fallback on unknown database errors without leaking internals", () => {
      const msg = sanitizeCashPaymentError({
        code: "42P01",
        message: 'relation "payments" does not exist',
      });
      assert.equal(
        msg,
        "Unable to record cash payment. Please review the selected obligations and try again."
      );
      assert.equal(msg.includes("payments"), false);
    });
  });

  describe("Cash settlement calculations and payment history mapping", () => {
    test("settles covered obligations, updates summary totals, and maps cash payment history", () => {
      const obligations = [
        {
          id: validObligationId1,
          semester_id: validSemesterId,
          kind: "fee",
          consequence_outcome: null,
          description: "Council Fee",
          amount: 250,
          waived_at: null,
          waiver_reason: null,
        },
        {
          id: validObligationId2,
          semester_id: validSemesterId,
          kind: "fine",
          consequence_outcome: "absence",
          description: "Assembly Fine",
          amount: 100,
          waived_at: null,
          waiver_reason: null,
        },
      ];

      const paymentItems = [
        { payment_id: validPaymentId, obligation_id: validObligationId1 },
        { payment_id: validPaymentId, obligation_id: validObligationId2 },
      ];

      const cashPayment = {
        id: validPaymentId,
        student_id: validStudentId,
        semester_id: validSemesterId,
        method: "cash",
        status: "verified",
        record_status: "current",
        receipt_id: validReceiptId,
        is_receipt_record: true,
        destination_label: null,
        destination_account_name: null,
        destination_account_reference: null,
        reference_number: null,
        amount: 350,
        submitted_at: pastManilaIso,
        decided_at: pastManilaIso,
        decision_reason: null,
      };

      const semesterCodeMap = new Map([[validSemesterId, "2026 · 1st Semester"]]);

      const standing = calculateObligationsStanding({
        obligations,
        paymentItems,
        payments: [cashPayment],
        refunds: [],
        targetSemesterId: validSemesterId,
        semesterCodeMap,
      });

      assert.equal(standing.length, 2);
      assert.equal(standing[0].status, "settled");
      assert.equal(standing[1].status, "settled");

      const summary = calculateStudentFinancialSummary({
        obligationsWithStanding: standing,
        targetSemesterId: validSemesterId,
      });
      assert.equal(summary.totalOutstandingPayable, 0);
      assert.equal(summary.totalSettledAmount, 350);
      assert.equal(summary.totalGrossObligationsAmount, 350);

      const history = mapPaymentHistory({
        payments: [cashPayment],
        refunds: [],
        semesterCodeMap,
        paymentItems,
        obligations,
      });

      assert.equal(history.length, 1);
      assert.equal(history[0].method, "cash");
      assert.equal(history[0].status, "verified");
      assert.equal(history[0].is_refunded, false);
      assert.equal(history[0].semester_code, "2026 · 1st Semester");
      assert.deepEqual(history[0].items, [
        { obligation_id: validObligationId1, description: "Council Fee", amount: 250 },
        { obligation_id: validObligationId2, description: "Assembly Fine", amount: 100 },
      ]);
    });
  });
});
