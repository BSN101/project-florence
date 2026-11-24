import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  calculateObligationsStanding,
  calculatePaymentMoneyTotals,
  mapPaymentHistory,
  previewPaymentCorrection,
  selectPaymentCorrectionOptions,
} from "./calculations.ts";
import {
  canCorrectPaymentForStudent,
  isPaymentCorrectable,
  sanitizeCorrectPaymentError,
} from "./contracts.ts";
import { correctPaymentSchema } from "./schemas.ts";

const studentId = "11111111-1111-4111-8111-111111111111";
const officerId = "22222222-2222-4222-8222-222222222222";
const semesterId = "33333333-3333-4333-8333-333333333333";
const ob1 = "55555555-5555-4555-8555-555555555555";
const ob2 = "66666666-6666-4666-8666-666666666666";
const requestKey = "88888888-8888-4888-8888-888888888888";
const receiptId = "99999999-9999-4999-8999-999999999999";
const pay1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const pay2 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const pay3 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const payment = (overrides) => ({
  id: pay1,
  student_id: studentId,
  semester_id: semesterId,
  method: "cash",
  status: "verified",
  record_status: "current",
  receipt_id: receiptId,
  is_receipt_record: true,
  destination_label: null,
  destination_account_name: null,
  destination_account_reference: null,
  reference_number: null,
  amount: 100,
  submitted_at: "2026-11-20T01:00:00Z",
  decided_at: "2026-11-20T01:00:00Z",
  decision_reason: null,
  supersedes_payment_id: null,
  ...overrides,
});

const obligation = (id, amount) => ({
  id,
  student_id: studentId,
  semester_id: semesterId,
  amount,
  waived_at: null,
  description: `Fee ${id.slice(0, 2)}`,
});

describe("Task T-039 / FL-028: payment correction rules", () => {
  describe("correctPaymentSchema", () => {
    const valid = { paymentId: pay1, obligationIds: [ob1, ob2], reason: "  Wrong fee  ", requestKey };

    test("accepts a valid payload and trims the note", () => {
      const parsed = correctPaymentSchema.safeParse(valid);
      assert.equal(parsed.success, true);
      if (parsed.success) assert.equal(parsed.data.reason, "Wrong fee");
    });

    test("rejects blank or over-long notes", () => {
      for (const reason of ["", "   ", "x".repeat(501)]) {
        assert.equal(correctPaymentSchema.safeParse({ ...valid, reason }).success, false);
      }
      assert.equal(correctPaymentSchema.safeParse({ ...valid, reason: "x".repeat(500) }).success, true);
    });

    test("rejects empty, duplicate and malformed obligation lists", () => {
      for (const obligationIds of [[], [ob1, ob1], ["not-a-uuid"]]) {
        assert.equal(correctPaymentSchema.safeParse({ ...valid, obligationIds }).success, false);
      }
    });

    test("rejects bad ids and request keys", () => {
      assert.equal(correctPaymentSchema.safeParse({ ...valid, paymentId: "x" }).success, false);
      assert.equal(correctPaymentSchema.safeParse({ ...valid, requestKey: "x" }).success, false);
    });
  });

  describe("authority helpers", () => {
    test("officers cannot correct their own payment", () => {
      assert.equal(canCorrectPaymentForStudent(officerId, studentId), true);
      assert.equal(canCorrectPaymentForStudent(studentId, studentId), false);
      assert.equal(canCorrectPaymentForStudent(null, studentId), false);
      assert.equal(canCorrectPaymentForStudent(officerId, undefined), false);
    });

    test("only a current authoritative receipt record is correctable", () => {
      const base = { status: "verified", record_status: "current", is_receipt_record: true, receipt_id: receiptId, is_refunded: false };
      assert.equal(isPaymentCorrectable(base), true);
      assert.equal(isPaymentCorrectable({ ...base, is_refunded: true }), true);
      assert.equal(isPaymentCorrectable({ ...base, record_status: "superseded" }), false);
      assert.equal(isPaymentCorrectable({ ...base, status: "pending", receipt_id: null }), false);
      assert.equal(isPaymentCorrectable({ ...base, is_receipt_record: false }), false);
      assert.equal(isPaymentCorrectable({ ...base, status: "rejected" }), false);
      assert.equal(isPaymentCorrectable({ ...base, status: "rejected", is_refunded: true }), true);
      assert.equal(isPaymentCorrectable(null), false);
    });
  });

  describe("sanitizeCorrectPaymentError", () => {
    test("maps known database messages to safe guidance", () => {
      const cases = [
        ["Self payment correction forbidden", /own payments/],
        ["Payment was already corrected", /already corrected/],
        ["Replacement items match the current record", /same obligations/],
        ["Selected obligation has a pending transfer", /awaiting review/],
        ["Correction would invalidate full refund history", /refunded amount/],
        ["Payment not found", /no longer be corrected/],
        ["Request key reused with different command, actor or input", /conflicted/],
      ];
      for (const [message, pattern] of cases) {
        assert.match(sanitizeCorrectPaymentError({ code: "55000", message }), pattern);
      }
    });

    test("hides unknown database details", () => {
      const text = sanitizeCorrectPaymentError({ code: "XX000", message: 'relation "payments" broke' });
      assert.doesNotMatch(text, /relation|payments/);
      assert.match(sanitizeCorrectPaymentError(null), /Unable to correct/);
    });
  });

  describe("totals and standing across a correction", () => {
    const superseded = payment({ id: pay1, record_status: "superseded", amount: 100 });
    const replacement = payment({ id: pay2, amount: 150, supersedes_payment_id: pay1, decision_reason: "Wrong fee" });

    test("gross counts the receipt once, using the replacement amount", () => {
      const totals = calculatePaymentMoneyTotals([superseded, replacement]);
      assert.equal(totals.totalGrossReceivedAmount, 150);
      assert.equal(totals.totalRefundedAmount, 0);
      assert.equal(totals.totalNetReceivedAmount, 150);
    });

    test("a twice-corrected receipt still counts once", () => {
      const second = payment({ id: pay3, amount: 80, supersedes_payment_id: pay2 });
      const totals = calculatePaymentMoneyTotals([
        superseded,
        { ...replacement, record_status: "superseded" },
        second,
      ]);
      assert.equal(totals.totalGrossReceivedAmount, 80);
    });

    test("a refunded receipt counts its refund once after correction", () => {
      const refunded = { ...replacement, is_refunded: true };
      const totals = calculatePaymentMoneyTotals([superseded, refunded]);
      assert.equal(totals.totalGrossReceivedAmount, 150);
      assert.equal(totals.totalRefundedAmount, 150);
      assert.equal(totals.totalNetReceivedAmount, 0);
    });

    test("settlement moves from the old obligation to the new one", () => {
      const standing = calculateObligationsStanding({
        obligations: [obligation(ob1, 100), obligation(ob2, 150)],
        paymentItems: [
          { payment_id: pay1, obligation_id: ob1 },
          { payment_id: pay2, obligation_id: ob2 },
        ],
        payments: [superseded, replacement],
        refunds: [],
        targetSemesterId: semesterId,
      });
      assert.equal(standing.find((o) => o.id === ob1).status, "unpaid");
      assert.equal(standing.find((o) => o.id === ob2).status, "settled");
    });

    test("a refunded receipt leaves every obligation unpaid", () => {
      const standing = calculateObligationsStanding({
        obligations: [obligation(ob1, 100), obligation(ob2, 150)],
        paymentItems: [
          { payment_id: pay1, obligation_id: ob1 },
          { payment_id: pay2, obligation_id: ob2 },
        ],
        payments: [superseded, replacement],
        refunds: [{ receipt_id: receiptId }],
        targetSemesterId: semesterId,
      });
      assert.ok(standing.every((o) => o.status === "unpaid"));
    });
  });

  describe("history mapping", () => {
    const rows = [
      payment({ id: pay1, record_status: "superseded", amount: 100 }),
      payment({ id: pay2, amount: 150, supersedes_payment_id: pay1, decision_reason: "Wrong fee" }),
    ];
    const history = mapPaymentHistory({
      payments: rows,
      refunds: [{ receipt_id: receiptId, refunded_at: "2026-11-22T01:00:00Z", reason: "Returned" }],
      paymentItems: [
        { payment_id: pay1, obligation_id: ob1 },
        { payment_id: pay2, obligation_id: ob2 },
      ],
      obligations: [obligation(ob1, 100), obligation(ob2, 150)],
    });

    test("links the superseded record to its replacement and keeps one refund identity", () => {
      const [old, current] = history;
      assert.equal(old.replaced_by_payment_id, pay2);
      assert.equal(current.replaced_by_payment_id, null);
      assert.equal(current.supersedes_payment_id, pay1);
      assert.equal(old.is_refunded, true);
      assert.equal(current.is_refunded, true);
      assert.equal(old.items.length, 1);
      assert.equal(current.items[0].amount, 150);
    });
  });

  describe("previewPaymentCorrection", () => {
    const current = [{ obligation_id: ob1, amount: 100 }];

    test("derives totals in cents and the difference", () => {
      const preview = previewPaymentCorrection({
        currentItems: current,
        replacementItems: [{ obligation_id: ob2, amount: "150.10" }],
      });
      assert.equal(preview.currentTotal, 100);
      assert.equal(preview.replacementTotal, 150.1);
      assert.equal(preview.difference, 50.1);
      assert.equal(preview.unchanged, false);
      assert.equal(preview.refundMismatch, false);
    });

    test("flags an unchanged selection regardless of order", () => {
      const preview = previewPaymentCorrection({
        currentItems: [...current, { obligation_id: ob2, amount: 50 }],
        replacementItems: [{ obligation_id: ob2, amount: 50 }, ...current],
      });
      assert.equal(preview.unchanged, true);
    });

    test("requires the replacement total to equal a full refund", () => {
      const mismatch = previewPaymentCorrection({
        currentItems: current,
        replacementItems: [{ obligation_id: ob2, amount: 150 }],
        refundedAmount: 100,
      });
      assert.equal(mismatch.refundMismatch, true);
      const equal = previewPaymentCorrection({
        currentItems: current,
        replacementItems: [{ obligation_id: ob2, amount: 100 }],
        refundedAmount: "100.00",
      });
      assert.equal(equal.refundMismatch, false);
    });
  });

  describe("selectPaymentCorrectionOptions", () => {
    const ob3 = "77777777-7777-4777-8777-777777777777";
    const ob4 = "88888888-8888-4888-8888-888888888881";
    const ob5 = "88888888-8888-4888-8888-888888888882";
    const otherReceipt = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const otherVerified = payment({ id: pay2, receipt_id: otherReceipt, amount: 150 });
    const pendingTransfer = payment({ id: pay3, status: "pending", receipt_id: null, is_receipt_record: false, amount: 200 });
    const obligations = [
      obligation(ob1, 100), // covered by target pay1
      obligation(ob2, 150), // settled by otherVerified
      obligation(ob3, 200), // on pendingTransfer
      { ...obligation(ob4, 50), waived_at: "2026-11-21T00:00:00Z" }, // waived
      obligation(ob5, 75), // unpaid
    ];
    const paymentItems = [
      { payment_id: pay1, obligation_id: ob1 },
      { payment_id: pay2, obligation_id: ob2 },
      { payment_id: pay3, obligation_id: ob3 },
    ];
    const payments = [payment({ id: pay1 }), otherVerified, pendingTransfer];

    test("for a verified unrefunded payment, includes its own items, unpaid items, and pending-transfer items only", () => {
      const options = selectPaymentCorrectionOptions({
        obligations,
        paymentItems,
        payments,
        refunds: [],
        targetPaymentId: pay1,
        targetSemesterId: semesterId,
        isTargetRefunded: false,
        targetStatus: "verified",
      });
      assert.deepEqual(
        options.map((o) => [o.id, o.status]),
        [
          [ob1, "unpaid"],
          [ob3, "pending_verification"],
          [ob5, "unpaid"],
        ]
      );
    });

    test("for a refunded payment, keeps waived and elsewhere-settled obligations available while flagging pending transfers", () => {
      const options = selectPaymentCorrectionOptions({
        obligations,
        paymentItems,
        payments,
        refunds: [{ receipt_id: receiptId }],
        targetPaymentId: pay1,
        targetSemesterId: semesterId,
        isTargetRefunded: true,
        targetStatus: "verified",
      });
      assert.deepEqual(
        options.map((o) => [o.id, o.status]),
        [
          [ob1, "unpaid"],
          [ob2, "settled"],
          [ob3, "pending_verification"],
          [ob4, "waived"],
          [ob5, "unpaid"],
        ]
      );
    });
  });
});
