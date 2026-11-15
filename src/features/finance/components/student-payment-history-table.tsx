"use client";

import { useState } from "react";
import {
  Banknote,
  CheckCircle2,
  Clock,
  ExternalLink,
  Receipt,
  RotateCcw,
  XCircle,
} from "lucide-react";

import { formatPhDate, formatPhp } from "../calculations";
import type { PaymentHistoryDTO } from "../contracts";

type PaymentTab = "all" | "verified" | "pending" | "rejected" | "refunded";

export function StudentPaymentHistoryTable({
  payments,
}: {
  payments: PaymentHistoryDTO[];
}) {
  const [activeTab, setActiveTab] = useState<PaymentTab>("all");

  const verifiedCount = payments.filter(
    (p) => !p.is_refunded && p.status === "verified"
  ).length;
  const pendingCount = payments.filter(
    (p) => !p.is_refunded && p.status === "pending"
  ).length;
  const rejectedCount = payments.filter(
    (p) => !p.is_refunded && p.status === "rejected"
  ).length;
  const refundedCount = payments.filter((p) => p.is_refunded).length;

  const filteredPayments = payments.filter((p) => {
    switch (activeTab) {
      case "verified":
        return !p.is_refunded && p.status === "verified";
      case "pending":
        return !p.is_refunded && p.status === "pending";
      case "rejected":
        return !p.is_refunded && p.status === "rejected";
      case "refunded":
        return p.is_refunded;
      default:
        return true;
    }
  });

  return (
    <div className="space-y-3">
      {/* Accessible Tab Switcher */}
      <div
        role="tablist"
        aria-label="Payment outcome filter"
        className="flex border-b border-border overflow-x-auto"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "all"}
          onClick={() => setActiveTab("all")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer shrink-0 ${
            activeTab === "all"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          All Payments
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
            {payments.length}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "verified"}
          onClick={() => setActiveTab("verified")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer shrink-0 ${
            activeTab === "verified"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Verified
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
            {verifiedCount}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "pending"}
          onClick={() => setActiveTab("pending")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer shrink-0 ${
            activeTab === "pending"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Pending Review
          {pendingCount > 0 && (
            <span className="rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 text-xs font-semibold">
              {pendingCount}
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "rejected"}
          onClick={() => setActiveTab("rejected")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer shrink-0 ${
            activeTab === "rejected"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Rejected
          {rejectedCount > 0 && (
            <span className="rounded-full bg-destructive/10 text-destructive px-2 py-0.5 text-xs font-semibold">
              {rejectedCount}
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "refunded"}
          onClick={() => setActiveTab("refunded")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer shrink-0 ${
            activeTab === "refunded"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Refunded
          {refundedCount > 0 && (
            <span className="rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-400 px-2 py-0.5 text-xs font-semibold">
              {refundedCount}
            </span>
          )}
        </button>
      </div>

      {/* Fixed Height Table Container with Sticky Header */}
      <div className="h-[28rem] overflow-auto overscroll-contain rounded-xl border border-border bg-card shadow-xs">
        {filteredPayments.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center">
            <Receipt className="size-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-foreground">
              No payment history recorded
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              {activeTab === "all"
                ? "Any bank transfers or council cash receipts submitted for this account will be tracked here."
                : "No payment records match the selected filter."}
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-muted text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <tr>
                <th scope="col" className="px-5 py-3">
                  Date
                </th>
                <th scope="col" className="px-5 py-3">
                  Method
                </th>
                <th scope="col" className="px-5 py-3">
                  Destination / Reference
                </th>
                <th scope="col" className="px-5 py-3 text-right">
                  Amount
                </th>
                <th scope="col" className="px-5 py-3 text-center">
                  Outcome
                </th>
                <th scope="col" className="px-5 py-3">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredPayments.map((p) => (
                <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                  {/* Date */}
                  <td className="px-5 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                    {formatPhDate(p.submitted_at)}
                  </td>

                  {/* Method */}
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 font-medium text-foreground text-xs">
                      {p.method === "cash" ? (
                        <>
                          <Banknote className="size-3.5 text-emerald-600" />
                          Cash Receipt
                        </>
                      ) : (
                        <>
                          <ExternalLink className="size-3.5 text-blue-600" />
                          Bank / E-Wallet
                        </>
                      )}
                    </span>
                  </td>

                  {/* Destination / Reference */}
                  <td className="px-5 py-3.5">
                    {p.method === "transfer" ? (
                      <div>
                        <div className="text-xs font-medium text-foreground">
                          {p.destination_label || "Transfer"}
                        </div>
                        {p.reference_number && (
                          <div className="text-[11px] font-mono text-muted-foreground">
                            Ref: {p.reference_number}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground font-mono">
                        Official Cash Receipt
                      </span>
                    )}
                  </td>

                  {/* Amount */}
                  <td className="px-5 py-3.5 text-right font-mono font-medium text-foreground whitespace-nowrap">
                    {formatPhp(p.amount)}
                  </td>

                  {/* Outcome */}
                  <td className="px-5 py-3.5 text-center whitespace-nowrap">
                    {p.is_refunded ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2.5 py-0.5 text-xs font-medium text-purple-700 dark:text-purple-400 border border-purple-500/20">
                        <RotateCcw className="size-3" />
                        Refunded
                      </span>
                    ) : p.status === "verified" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="size-3" />
                        Verified
                      </span>
                    ) : p.status === "pending" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-400 border border-indigo-500/20">
                        <Clock className="size-3" />
                        Pending Review
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive border border-destructive/20">
                        <XCircle className="size-3" />
                        Rejected
                      </span>
                    )}
                  </td>

                  {/* Notes / Reason */}
                  <td className="px-5 py-3.5 text-xs text-muted-foreground max-w-xs">
                    {p.is_refunded ? (
                      <span className="text-purple-600 dark:text-purple-400">
                        Refund note: {p.refund_reason || "Full payment returned."}
                      </span>
                    ) : p.status === "rejected" && p.decision_reason ? (
                      <span className="text-destructive font-medium">
                        Reason: {p.decision_reason}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/60">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
