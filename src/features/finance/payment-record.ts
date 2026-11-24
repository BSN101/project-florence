import { formatPhDate, formatPhp } from "./calculations";
import type { PaymentHistoryDTO } from "./contracts";

// One description of a payment record, used by both the dialog and the saved photo
// so the two never disagree.

export type PaymentRecordTone = "pending" | "verified" | "rejected" | "refunded" | "superseded";

export type PaymentRecordView = {
  title: string;
  status: { label: string; tone: PaymentRecordTone };
  /** Shown whenever the record is not a current verified receipt. */
  notice: string | null;
  rows: Array<{ label: string; value: string; mono?: boolean }>;
  items: Array<{ label: string; value: string }>;
  total: string;
};

export function describePaymentRecord(
  payment: PaymentHistoryDTO,
  studentLabel?: string
): PaymentRecordView {
  const tone: PaymentRecordTone =
    payment.record_status === "superseded"
      ? "superseded"
      : payment.is_refunded
        ? "refunded"
        : payment.status === "verified"
          ? "verified"
          : payment.status === "pending"
            ? "pending"
            : "rejected";

  const statusLabel = {
    pending: "Pending review",
    verified: "Verified",
    rejected: "Rejected",
    refunded: "Refunded",
    superseded: "Superseded",
  }[tone];

  // Only Council verification recognizes money as received; never let a saved photo
  // of anything else read as an official receipt.
  const notice = {
    pending: "Submission record, not an official receipt. Awaiting Council verification.",
    verified: null,
    rejected: "Submission record, not an official receipt. This submission was rejected.",
    refunded: "This payment was refunded in full.",
    superseded: "Replaced by a corrected record. Not an official receipt.",
  }[tone];

  const rows: PaymentRecordView["rows"] = [];
  if (studentLabel) rows.push({ label: "Student", value: studentLabel });
  if (payment.semester_code) rows.push({ label: "Term", value: payment.semester_code });
  if (payment.method === "transfer") {
    const paidTo = [payment.destination_label, payment.destination_account_name]
      .filter(Boolean)
      .join(" · ");
    if (paidTo) rows.push({ label: "Paid to", value: paidTo });
    if (payment.destination_account_reference) {
      rows.push({ label: "Account no.", value: payment.destination_account_reference, mono: true });
    }
    if (payment.reference_number) {
      rows.push({ label: "Reference no.", value: payment.reference_number, mono: true });
    }
  } else {
    rows.push({ label: "Method", value: "Cash" });
  }
  if (payment.received_at) rows.push({ label: "Received", value: formatPhDate(payment.received_at) });
  if (payment.method === "cash" && payment.receipt_id) {
    rows.push({ label: "Receipt no.", value: payment.receipt_id, mono: true });
  }
  rows.push({ label: payment.method === "cash" ? "Recorded" : "Submitted", value: formatPhDate(payment.submitted_at) });
  if (payment.decided_at) rows.push({ label: "Decided", value: formatPhDate(payment.decided_at) });
  if (payment.supersedes_payment_id) {
    // A replacement stores the correction note in decision_reason, not a rejection reason.
    rows.push({ label: "Corrects record", value: payment.supersedes_payment_id, mono: true });
    if (payment.decision_reason) rows.push({ label: "Correction note", value: payment.decision_reason });
  } else if (payment.status === "rejected" && payment.decision_reason) {
    rows.push({ label: "Reason", value: payment.decision_reason });
  }
  if (payment.replaced_by_payment_id) {
    rows.push({ label: "Replaced by", value: payment.replaced_by_payment_id, mono: true });
  }
  if (payment.is_refunded) {
    if (payment.refunded_at) rows.push({ label: "Refunded", value: formatPhDate(payment.refunded_at) });
    if (payment.refund_reason) rows.push({ label: "Refund note", value: payment.refund_reason });
  }
  rows.push({ label: "Record ID", value: payment.id, mono: true });

  return {
    title: payment.method === "transfer" ? "Transfer payment record" : "Cash payment record",
    status: { label: statusLabel, tone },
    notice,
    rows,
    items: payment.items.map((item) => ({ label: item.description, value: formatPhp(item.amount) })),
    total: formatPhp(payment.amount),
  };
}
