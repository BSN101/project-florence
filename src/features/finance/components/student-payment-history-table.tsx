"use client";

import { useState } from "react";
import {
  Banknote,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { getTransferProofUrl } from "../actions";
import { formatPhDate, formatPhp } from "../calculations";
import type { PaymentHistoryDTO } from "../contracts";

const PAGE_SIZE = 25;

const METHOD_OPTIONS = [
  { value: "all", label: "All" },
  { value: "transfer", label: "Bank / E-Wallet" },
  { value: "cash", label: "Cash Receipt" },
] as const;

const OUTCOME_OPTIONS = [
  { value: "all", label: "All" },
  { value: "verified", label: "Verified" },
  { value: "pending", label: "Pending Review" },
  { value: "rejected", label: "Rejected" },
  { value: "refunded", label: "Refunded" },
] as const;

export function StudentPaymentHistoryTable({
  payments,
  isCouncilView = false,
}: {
  payments: PaymentHistoryDTO[];
  isCouncilView?: boolean;
}) {
  const [method, setMethod] = useState("all");
  const [outcome, setOutcome] = useState("all");
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
  const matchesOutcome = (p: PaymentHistoryDTO, selectedOutcome: string) => {
    if (selectedOutcome === "all") return true;
    if (p.record_status === "superseded") return false;
    if (selectedOutcome === "refunded") return p.is_refunded;
    return !p.is_refunded && p.status === selectedOutcome;
  };

  const filteredPayments = payments.filter(
    (p) => (method === "all" || p.method === method) && matchesOutcome(p, outcome)
  );

  const filterKey = `${method}|${outcome}`;
  const [pageState, setPageState] = useState({ key: filterKey, page: 0 });
  const pageCount = Math.max(1, Math.ceil(filteredPayments.length / PAGE_SIZE));
  const page =
    pageState.key === filterKey
      ? Math.min(pageState.page, pageCount - 1)
      : 0;
  const first = page * PAGE_SIZE;
  const pageRows = filteredPayments.slice(first, first + PAGE_SIZE);
  const setPage = (next: number) => setPageState({ key: filterKey, page: next });

  const currentMethodLabel =
    METHOD_OPTIONS.find((opt) => opt.value === method)?.label ?? "All";
  const currentOutcomeLabel =
    OUTCOME_OPTIONS.find((opt) => opt.value === outcome)?.label ?? "All";

  return (
    <div className="flex flex-col gap-3">
      {/* Filter Controls */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Select
          value={method}
          onValueChange={(next) => setMethod(next ?? "all")}
        >
          <SelectTrigger
            className="w-full text-xs sm:w-[160px]"
            aria-label="Method"
          >
            <span className="truncate">Method: {currentMethodLabel}</span>
          </SelectTrigger>
          <SelectContent>
            {METHOD_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={outcome}
          onValueChange={(next) => setOutcome(next ?? "all")}
        >
          <SelectTrigger
            className="w-full text-xs sm:w-[160px]"
            aria-label="Outcome"
          >
            <span className="truncate">Outcome: {currentOutcomeLabel}</span>
          </SelectTrigger>
          <SelectContent>
            {OUTCOME_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Fixed Height Table Container with Sticky Header */}
      <div className="h-[26rem] overflow-auto overscroll-contain rounded-xl border border-border bg-card shadow-xs">
        {filteredPayments.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <Receipt className="size-8 text-muted-foreground/60" />
            <p className="text-sm font-medium text-foreground">
              {payments.length > 0
                ? "No records match these filters"
                : "No payment history recorded"}
            </p>
            <p className="text-xs text-muted-foreground">
              {payments.length > 0
                ? "Change or clear the filters above."
                : "Any bank transfers or council cash receipts submitted for this account will be tracked here."}
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 border-b border-border bg-muted font-medium text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Date
                </th>
                <th scope="col" className="px-4 py-3">
                  Method
                </th>
                <th scope="col" className="px-4 py-3">
                  Destination / Reference
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Amount
                </th>
                <th scope="col" className="px-4 py-3 text-center">
                  Outcome
                </th>
                <th scope="col" className="px-4 py-3">
                  Notes
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {pageRows.map((p) => (
                <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                  {/* Date */}
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {formatPhDate(p.submitted_at)}
                  </td>

                  {/* Method */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
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
                  <td className="px-4 py-3">
                    {p.method === "transfer" ? (
                      <div className="space-y-0.5">
                        {p.destination_account_name && (
                          <div className="font-medium text-foreground">
                            {p.destination_account_name}
                          </div>
                        )}
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
                        {!p.destination_account_name &&
                          !p.destination_account_reference &&
                          !p.reference_number && (
                            <span className="text-muted-foreground/60">—</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground font-mono">
                        Official Cash Receipt
                      </span>
                    )}
                  </td>

                  {/* Amount */}
                  <td className="px-4 py-3 text-right font-mono font-medium text-foreground whitespace-nowrap">
                    {formatPhp(p.amount)}
                  </td>

                  {/* Outcome */}
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    {p.record_status === "superseded" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground border border-border">
                        <History className="size-3" />
                        Superseded
                      </span>
                    ) : p.is_refunded ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-[11px] font-medium text-purple-700 dark:text-purple-400 border border-purple-500/20">
                        <RotateCcw className="size-3" />
                        Refunded
                      </span>
                    ) : p.status === "verified" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="size-3" />
                        Verified
                      </span>
                    ) : p.status === "pending" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-400 border border-indigo-500/20">
                        <Clock className="size-3" />
                        Pending Review
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive border border-destructive/20">
                        <XCircle className="size-3" />
                        Rejected
                      </span>
                    )}
                  </td>

                  {/* Notes / Reason */}
                  <td className="px-4 py-3 text-muted-foreground max-w-xs">
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
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {p.proof_file_id ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleInspectProof(p)}
                        className="h-7 cursor-pointer gap-1 rounded-lg border-primary/25 bg-primary/5 px-2.5 text-[11px] font-medium text-primary shadow-2xs transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary active:opacity-60"
                      >
                        <Eye className="size-3 shrink-0 text-primary" />
                        <span>View Proof</span>
                      </Button>
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

      <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
        <span>
          {filteredPayments.length === 0 ? (
            "Showing 0 records"
          ) : (
            <>
              Showing <strong>{first + 1}–{first + pageRows.length}</strong> of{" "}
              {filteredPayments.length}
            </>
          )}
        </span>
        <nav
          aria-label="Payment history table pages"
          className="flex items-center gap-2"
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="Previous page"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span aria-live="polite">
            Page {page + 1} of {pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="Next page"
            disabled={page === pageCount - 1}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </nav>
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
