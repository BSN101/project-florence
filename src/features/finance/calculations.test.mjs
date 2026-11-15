import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  toCents,
  fromCents,
  formatPhp,
  determineObligationStatus,
  calculateObligationsStanding,
  calculateStudentFinancialSummary,
  mapPaymentHistory,
  scopeFinancialRecordsForSemester,
} from "./calculations.ts";
import { isAuthorizedCouncilFinancialViewer } from "./contracts.ts";

const semesterCurrent = "11111111-1111-1111-1111-111111111111";
const semesterPrior = "22222222-2222-2222-2222-222222222222";
const studentId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

describe("Task T-033 / FL-022: Shared Financial Calculations", () => {
  describe("Cent precision math and formatting", () => {
    test("converts between float and cents without binary floating point drift", () => {
      // 0.1 + 0.2 in native JS equals 0.30000000000000004
      const sumFloat = 0.1 + 0.2;
      assert.notEqual(sumFloat, 0.3);

      const sumCents = toCents(0.1) + toCents(0.2);
      assert.equal(sumCents, 30);
      assert.equal(fromCents(sumCents), 0.3);

      assert.equal(toCents(150.75), 15075);
      assert.equal(fromCents(15075), 150.75);
    });

    test("formats PHP currency amounts consistently", () => {
      const formatted = formatPhp(1500.5);
      // Standard Philippine Peso format contains 1,500.50
      assert.equal(formatted.includes("1,500.50"), true);
    });
  });

  describe("Obligation standing status determination", () => {
    const obId = "ob-1";

    test("marks obligation as waived when waived_at is present regardless of payment history", () => {
      const status = determineObligationStatus({
        obligation: { id: obId, waived_at: "2026-11-01T00:00:00Z" },
        obligationPayments: [
          {
            id: "pay-1",
            status: "verified",
            record_status: "current",
            is_receipt_record: true,
            receipt_id: "rcpt-1",
          },
        ],
        refundedReceiptIds: new Set(),
      });
      assert.equal(status, "waived");
    });

    test("marks obligation as settled when linked to a current verified receipt record with no refund", () => {
      const status = determineObligationStatus({
        obligation: { id: obId, waived_at: null },
        obligationPayments: [
          {
            id: "pay-1",
            status: "verified",
            record_status: "current",
            is_receipt_record: true,
            receipt_id: "rcpt-1",
          },
        ],
        refundedReceiptIds: new Set(),
      });
      assert.equal(status, "settled");
    });

    test("marks obligation as unpaid when the verified payment was refunded", () => {
      const status = determineObligationStatus({
        obligation: { id: obId, waived_at: null },
        obligationPayments: [
          {
            id: "pay-1",
            status: "verified",
            record_status: "current",
            is_receipt_record: true,
            receipt_id: "rcpt-1",
          },
        ],
        refundedReceiptIds: new Set(["rcpt-1"]),
      });
      assert.equal(status, "unpaid");
    });

    test("marks obligation as pending_verification when linked to a current pending payment", () => {
      const status = determineObligationStatus({
        obligation: { id: obId, waived_at: null },
        obligationPayments: [
          {
            id: "pay-2",
            status: "pending",
            record_status: "current",
            is_receipt_record: false,
            receipt_id: null,
          },
        ],
        refundedReceiptIds: new Set(),
      });
      assert.equal(status, "pending_verification");
    });

    test("ignores superseded and rejected payments, leaving obligation as unpaid", () => {
      const status = determineObligationStatus({
        obligation: { id: obId, waived_at: null },
        obligationPayments: [
          {
            id: "pay-old",
            status: "verified",
            record_status: "superseded",
            is_receipt_record: true,
            receipt_id: "rcpt-old",
          },
          {
            id: "pay-rej",
            status: "rejected",
            record_status: "current",
            is_receipt_record: false,
            receipt_id: null,
          },
        ],
        refundedReceiptIds: new Set(),
      });
      assert.equal(status, "unpaid");
    });
  });

  describe("Multi-semester standing enrichment and carryover calculation", () => {
    const obligations = [
      {
        id: "ob-current-1",
        student_id: studentId,
        semester_id: semesterCurrent,
        kind: "fee",
        fee_definition_id: null,
        fee_publication_id: null,
        consequence_outcome: null,
        event_attendance_id: null,
        description: "Student Council Fee",
        amount: 150.0,
        waived_at: null,
        waived_by: null,
        waiver_reason: null,
        created_at: "2026-11-01T00:00:00Z",
      },
      {
        id: "ob-current-2",
        student_id: studentId,
        semester_id: semesterCurrent,
        kind: "fine",
        fee_definition_id: null,
        fee_publication_id: null,
        consequence_outcome: "absence",
        event_attendance_id: null,
        description: "General Assembly Absence Fine",
        amount: 100.0,
        waived_at: null,
        waived_by: null,
        waiver_reason: null,
        created_at: "2026-11-02T00:00:00Z",
      },
      {
        id: "ob-prior-1",
        student_id: studentId,
        semester_id: semesterPrior,
        kind: "fee",
        fee_definition_id: null,
        fee_publication_id: null,
        consequence_outcome: null,
        event_attendance_id: null,
        description: "Prior Term Badge Fee",
        amount: 200.0,
        waived_at: null,
        waived_by: null,
        waiver_reason: null,
        created_at: "2026-06-01T00:00:00Z",
      },
      {
        id: "ob-prior-waived",
        student_id: studentId,
        semester_id: semesterPrior,
        kind: "fine",
        fee_definition_id: null,
        fee_publication_id: null,
        consequence_outcome: "late",
        event_attendance_id: null,
        description: "Old Fine (Waived)",
        amount: 50.0,
        waived_at: "2026-06-15T00:00:00Z",
        waived_by: "council-exec",
        waiver_reason: "Medical clearance approved",
        created_at: "2026-06-01T00:00:00Z",
      },
    ];

    // ob-current-1 is settled by pay-1
    const payments = [
      {
        id: "pay-1",
        status: "verified",
        record_status: "current",
        is_receipt_record: true,
        receipt_id: "rcpt-1",
      },
    ];

    const paymentItems = [{ payment_id: "pay-1", obligation_id: "ob-current-1" }];

    test("computes standing per obligation and tags prior semester items", () => {
      const enriched = calculateObligationsStanding({
        obligations,
        paymentItems,
        payments,
        refunds: [],
        targetSemesterId: semesterCurrent,
        semesterCodeMap: new Map([
          [semesterCurrent, "2026-2S"],
          [semesterPrior, "2026-1S"],
        ]),
      });

      assert.equal(enriched.length, 4);

      const currentSettled = enriched.find((o) => o.id === "ob-current-1");
      assert.equal(currentSettled.status, "settled");
      assert.equal(currentSettled.is_past_semester, false);
      assert.equal(currentSettled.semester_code, "2026-2S");

      const currentUnpaid = enriched.find((o) => o.id === "ob-current-2");
      assert.equal(currentUnpaid.status, "unpaid");
      assert.equal(currentUnpaid.is_past_semester, false);

      const priorUnpaid = enriched.find((o) => o.id === "ob-prior-1");
      assert.equal(priorUnpaid.status, "unpaid");
      assert.equal(priorUnpaid.is_past_semester, true);
      assert.equal(priorUnpaid.semester_code, "2026-1S");

      const priorWaived = enriched.find((o) => o.id === "ob-prior-waived");
      assert.equal(priorWaived.status, "waived");
      assert.equal(priorWaived.is_past_semester, true);
    });

    test("aggregates student financial summary with prior collectible carryovers", () => {
      const enriched = calculateObligationsStanding({
        obligations,
        paymentItems,
        payments,
        refunds: [],
        targetSemesterId: semesterCurrent,
      });

      const summary = calculateStudentFinancialSummary({
        obligationsWithStanding: enriched,
        targetSemesterId: semesterCurrent,
      });

      // Gross: 150 + 100 + 200 + 50 = 500
      assert.equal(summary.totalGrossObligationsAmount, 500.0);
      // Waived: 50
      assert.equal(summary.totalWaivedAmount, 50.0);
      // Settled: 150 (ob-current-1)
      assert.equal(summary.totalSettledAmount, 150.0);
      // Pending: 0
      assert.equal(summary.totalPendingVerificationAmount, 0.0);
      // Current semester payable: 100 (ob-current-2)
      assert.equal(summary.currentSemesterPayable, 100.0);
      // Prior semesters overdue payable: 200 (ob-prior-1 remains collectible)
      assert.equal(summary.priorSemestersOverduePayable, 200.0);
      // Total outstanding payable: 100 + 200 = 300
      assert.equal(summary.totalOutstandingPayable, 300.0);
    });

    test("handles pending transfer correctly in summary", () => {
      // Add a pending payment for ob-current-2
      const pendingPayments = [
        ...payments,
        {
          id: "pay-pending",
          status: "pending",
          record_status: "current",
          is_receipt_record: false,
          receipt_id: null,
        },
      ];
      const pendingItems = [
        ...paymentItems,
        { payment_id: "pay-pending", obligation_id: "ob-current-2" },
      ];

      const enriched = calculateObligationsStanding({
        obligations,
        paymentItems: pendingItems,
        payments: pendingPayments,
        refunds: [],
        targetSemesterId: semesterCurrent,
      });

      const summary = calculateStudentFinancialSummary({
        obligationsWithStanding: enriched,
        targetSemesterId: semesterCurrent,
      });

      // Pending amount is now 100
      assert.equal(summary.totalPendingVerificationAmount, 100.0);
      // Current semester unpaid is now 0 (since ob-current-2 is pending review)
      assert.equal(summary.currentSemesterPayable, 0.0);
      // Prior overdue remains 200
      assert.equal(summary.priorSemestersOverduePayable, 200.0);
      // Total payable is 200
      assert.equal(summary.totalOutstandingPayable, 200.0);
    });

    test("returns all zeros for a student with zero obligations", () => {
      const summary = calculateStudentFinancialSummary({
        obligationsWithStanding: [],
        targetSemesterId: semesterCurrent,
      });

      assert.equal(summary.totalGrossObligationsAmount, 0.0);
      assert.equal(summary.totalWaivedAmount, 0.0);
      assert.equal(summary.totalSettledAmount, 0.0);
      assert.equal(summary.totalPendingVerificationAmount, 0.0);
      assert.equal(summary.currentSemesterPayable, 0.0);
      assert.equal(summary.priorSemestersOverduePayable, 0.0);
      assert.equal(summary.totalOutstandingPayable, 0.0);
    });
  });

  describe("Payment history mapping with refund records", () => {
    test("attaches refund details to refunded payments while leaving unrefunded ones clean", () => {
      const rawPayments = [
        {
          id: "pay-1",
          student_id: studentId,
          semester_id: semesterCurrent,
          method: "transfer",
          status: "verified",
          record_status: "current",
          receipt_id: "rcpt-1",
          is_receipt_record: true,
          destination_label: "GCash",
          destination_account_name: "Florence Treasury",
          destination_account_reference: "0917-123-4567",
          reference_number: "9876543210",
          amount: 150.0,
          submitted_at: "2026-11-01T10:00:00Z",
          decided_at: "2026-11-01T11:00:00Z",
          decision_reason: null,
        },
        {
          id: "pay-2",
          student_id: studentId,
          semester_id: semesterCurrent,
          method: "cash",
          status: "verified",
          record_status: "current",
          receipt_id: "rcpt-2",
          is_receipt_record: true,
          destination_label: null,
          destination_account_name: null,
          destination_account_reference: null,
          reference_number: null,
          amount: 200.0,
          submitted_at: "2026-11-02T10:00:00Z",
          decided_at: "2026-11-02T10:00:00Z",
          decision_reason: null,
        },
      ];

      const refunds = [
        {
          receipt_id: "rcpt-1",
          refunded_at: "2026-11-03T14:00:00Z",
          reason: "Duplicate transfer error refund",
        },
      ];

      const mapped = mapPaymentHistory({
        payments: rawPayments,
        refunds,
        semesterCodeMap: new Map([[semesterCurrent, "2026-2S"]]),
      });

      assert.equal(mapped.length, 2);

      const refundedPayment = mapped.find((p) => p.id === "pay-1");
      assert.equal(refundedPayment.is_refunded, true);
      assert.equal(refundedPayment.refunded_at, "2026-11-03T14:00:00Z");
      assert.equal(refundedPayment.refund_reason, "Duplicate transfer error refund");
      assert.equal(refundedPayment.semester_code, "2026-2S");

      const cleanPayment = mapped.find((p) => p.id === "pay-2");
      assert.equal(cleanPayment.is_refunded, false);
      assert.equal(cleanPayment.refunded_at, null);
      assert.equal(cleanPayment.refund_reason, null);
    });
  });

  describe("Semester scoping with prior-term carryover retention", () => {
    const semesterFuture = "33333333-3333-3333-3333-333333333333";

    test("retains current-semester items and prior unpaid/pending carryovers while excluding prior closed and future items", () => {
      const obligationsWithStanding = [
        { id: "curr-settled", semester_id: semesterCurrent, status: "settled", amount: 100 },
        { id: "curr-unpaid", semester_id: semesterCurrent, status: "unpaid", amount: 150 },
        { id: "prior-unpaid", semester_id: semesterPrior, status: "unpaid", amount: 200 },
        { id: "prior-pending", semester_id: semesterPrior, status: "pending_verification", amount: 75 },
        { id: "prior-settled", semester_id: semesterPrior, status: "settled", amount: 300 },
        { id: "prior-waived", semester_id: semesterPrior, status: "waived", amount: 50 },
        { id: "future-unpaid", semester_id: semesterFuture, status: "unpaid", amount: 400 },
      ];

      const payments = [
        { id: "pay-curr", semester_id: semesterCurrent },
        { id: "pay-prior", semester_id: semesterPrior },
        { id: "pay-future", semester_id: semesterFuture },
      ];

      const scoped = scopeFinancialRecordsForSemester({
        obligationsWithStanding,
        payments,
        targetSemesterId: semesterCurrent,
        priorSemesterIds: new Set([semesterPrior]),
      });

      assert.deepEqual(
        scoped.obligations.map((o) => o.id),
        ["curr-settled", "curr-unpaid", "prior-unpaid", "prior-pending"]
      );
      assert.deepEqual(
        scoped.payments.map((p) => p.id),
        ["pay-curr"]
      );
    });

    test("keeps prior-semester payments linked to retained carryover obligations", () => {
      const obligationsWithStanding = [
        { id: "curr-unpaid", semester_id: semesterCurrent, status: "unpaid", amount: 150 },
        { id: "prior-pending", semester_id: semesterPrior, status: "pending_verification", amount: 75 },
        { id: "prior-settled", semester_id: semesterPrior, status: "settled", amount: 300 },
      ];
      const payments = [
        { id: "pay-curr", semester_id: semesterCurrent },
        { id: "pay-prior-pending", semester_id: semesterPrior },
        { id: "pay-prior-settled", semester_id: semesterPrior },
      ];
      const paymentItems = [
        { payment_id: "pay-prior-pending", obligation_id: "prior-pending" },
        { payment_id: "pay-prior-settled", obligation_id: "prior-settled" },
      ];

      const scoped = scopeFinancialRecordsForSemester({
        obligationsWithStanding,
        payments,
        paymentItems,
        targetSemesterId: semesterCurrent,
        priorSemesterIds: new Set([semesterPrior]),
      });

      assert.deepEqual(
        scoped.payments.map((p) => p.id),
        ["pay-curr", "pay-prior-pending"]
      );
    });
  });

  describe("Council financial viewer authorization guard", () => {
    test("permits council executive and operations roles", () => {
      assert.equal(isAuthorizedCouncilFinancialViewer("executive"), true);
      assert.equal(isAuthorizedCouncilFinancialViewer("operations"), true);
    });

    test("forbids representatives, faculty, unknown roles, and nullish states", () => {
      assert.equal(isAuthorizedCouncilFinancialViewer("representative"), false);
      assert.equal(isAuthorizedCouncilFinancialViewer("faculty"), false);
      assert.equal(isAuthorizedCouncilFinancialViewer("admin"), false);
      assert.equal(isAuthorizedCouncilFinancialViewer(null), false);
      assert.equal(isAuthorizedCouncilFinancialViewer(undefined), false);
      assert.equal(isAuthorizedCouncilFinancialViewer(""), false);
    });
  });
});
