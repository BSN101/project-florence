"use client";

import { useState } from "react";
import {
  Banknote,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  History,
  Loader2,
  Receipt,
  RotateCcw,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getTransferProofUrl } from "../actions";
import { formatPhDate, formatPhp } from "../calculations";
import type { PaymentHistoryDTO } from "../contracts";

type PaymentTab = "all" | "verified" | "pending" | "rejected" | "refunded";

export function StudentPaymentHistoryTable({
  payments,
  isCouncilView = false,
}: {
  payments: PaymentHistoryDTO[];
  isCouncilView?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<PaymentTab>("all");
  const [inspectingProof, setInspectingProof] =
    useState<PaymentHistoryDTO | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const [isLoadingProof, setIsLoadingProof] = useState(false);

  async function handleInspectProof(payment: PaymentHistoryDTO) {
    if (!payment.proof_file_id) return;
    setInspectingProof(payment);
    setProofUrl(null);
    setProofError(null);
    setIsLoadingProof(true);

    const res = await getTransferProofUrl(payment.proof_file_id, {
      isCouncilView,
    });
    if (res.success) {
      setProofUrl(res.url);
    } else {
      setProofError(res.error);
    }
    setIsLoadingProof(false);
  }

  // Superseded versions stay in "All" as correction history but never count toward an outcome.
  const matchesTab = (p: PaymentHistoryDTO, tab: PaymentTab) => {
    if (tab === "all") return true;
    if (p.record_status === "superseded") return false;
    if (tab === "refunded") return p.is_refunded;
    return !p.is_refunded && p.status === tab;
  };

  const verifiedCount = payments.filter((p) => matchesTab(p, "verified")).length;
  const pendingCount = payments.filter((p) => matchesTab(p, "pending")).length;
  const rejectedCount = payments.filter((p) => matchesTab(p, "rejected")).length;
  const refundedCount = payments.filter((p) => matchesTab(p, "refunded")).length;

  const filteredPayments = payments.filter((p) => matchesTab(p, activeTab));

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
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer shrink-0 ${activeTab === "all"
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
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer shrink-0 ${activeTab === "verified"
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
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer shrink-0 ${activeTab === "pending"
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
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer shrink-0 ${activeTab === "rejected"
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
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer shrink-0 ${activeTab === "refunded"
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
                <th scope="col" className="px-5 py-3 text-right">
                  Actions
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
                      <div className="space-y-0.5">
                        <div className="text-xs font-medium text-foreground">
                          {p.destination_label || "Transfer"}
                          {p.destination_account_name
                            ? ` · ${p.destination_account_name}`
                            : ""}
                        </div>
                        {p.destination_account_reference && (
                          <div className="text-[11px] font-mono text-muted-foreground">
                            Acct: {p.destination_account_reference}
                          </div>
                        )}
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
                    {p.record_status === "superseded" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground border border-border">
                        <History className="size-3" />
                        Superseded
                      </span>
                    ) : p.is_refunded ? (
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
                    {p.record_status === "superseded" ? (
                      <span>Replaced by a corrected record.</span>
                    ) : p.is_refunded ? (
                      <span className="text-purple-600 dark:text-purple-400">
                        Refund note: {p.refund_reason || "Full payment returned."}
                      </span>
                    ) : p.status === "rejected" && p.decision_reason ? (
                      <span className="text-destructive font-medium">
                        Reason: {p.decision_reason}
                      </span>
                    ) : p.status === "pending" ? (
                      <span>
                        Awaiting Council verification; does not settle obligations
                        until verified.
                      </span>
                    ) : (
                      <span className="text-muted-foreground/60">—</span>
                    )}
                  </td>

                  {/* Proof Action */}
                  <td className="px-5 py-3.5 text-right whitespace-nowrap">
                    {p.proof_file_id ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleInspectProof(p)}
                        className="h-8 cursor-pointer gap-1.5 rounded-lg border-primary/25 bg-primary/5 px-3 text-xs font-medium text-primary shadow-2xs transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary active:opacity-60"
                      >
                        <Eye className="size-3.5 shrink-0 text-primary" />
                        <span>View Proof</span>
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground/60">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Transfer Receipt Proof Preview Dialog */}
      {inspectingProof && (
        <Dialog
          open={Boolean(inspectingProof)}
          onOpenChange={(open) => {
            if (!open) {
              setInspectingProof(null);
              setProofUrl(null);
              setProofError(null);
            }
          }}
        >
          <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] grid-cols-1 overflow-x-hidden overflow-y-auto p-5 sm:max-w-lg sm:p-6">
            <DialogHeader>
              <DialogTitle>Transfer Receipt Proof</DialogTitle>
              <DialogDescription>
                {inspectingProof.destination_label || "Transfer"}
                {inspectingProof.reference_number
                  ? ` · Ref: ${inspectingProof.reference_number}`
                  : ""}
              </DialogDescription>
            </DialogHeader>

            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-xs">
                <div className="min-w-0 space-y-0.5">
                  <div className="font-medium text-foreground">
                    {inspectingProof.destination_label || "Transfer"}
                    {inspectingProof.destination_account_name
                      ? ` · ${inspectingProof.destination_account_name}`
                      : ""}
                  </div>
                  {inspectingProof.reference_number && (
                    <div className="break-all font-mono text-muted-foreground">
                      Ref: {inspectingProof.reference_number}
                    </div>
                  )}
                </div>
                <div className="shrink-0 font-heading text-base font-semibold tabular-nums text-foreground">
                  {formatPhp(inspectingProof.amount)}
                </div>
              </div>

              <div className="flex min-h-48 items-center justify-center rounded-xl border border-border bg-muted/20 p-3">
                {isLoadingProof && (
                  <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-6 animate-spin text-primary" />
                    <span>Loading receipt proof...</span>
                  </div>
                )}
                {proofError && !isLoadingProof && (
                  <p className="text-center text-sm text-destructive">
                    {proofError}
                  </p>
                )}
                {proofUrl && !isLoadingProof && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={proofUrl}
                    alt="Submitted transfer receipt proof"
                    className="mx-auto max-h-[60vh] w-full rounded-lg border border-border bg-background object-contain shadow-xs"
                  />
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setInspectingProof(null);
                  setProofUrl(null);
                  setProofError(null);
                }}
                className="min-h-11"
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
