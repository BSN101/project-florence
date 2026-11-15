"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Info,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatPhDate, formatPhp } from "../calculations";
import type { ObligationWithStandingDTO } from "../contracts";

type ObligationTab = "all" | "unpaid" | "pending" | "settled" | "waived";

export function StudentObligationsTable({
  obligations,
}: {
  obligations: ObligationWithStandingDTO[];
}) {
  const [activeTab, setActiveTab] = useState<ObligationTab>("all");
  const [inspectingWaiver, setInspectingWaiver] =
    useState<ObligationWithStandingDTO | null>(null);

  const unpaidCount = obligations.filter((o) => o.status === "unpaid").length;
  const pendingCount = obligations.filter(
    (o) => o.status === "pending_verification"
  ).length;
  const settledCount = obligations.filter((o) => o.status === "settled").length;
  const waivedCount = obligations.filter((o) => o.status === "waived").length;

  const filteredObligations = obligations.filter((item) => {
    switch (activeTab) {
      case "unpaid":
        return item.status === "unpaid";
      case "pending":
        return item.status === "pending_verification";
      case "settled":
        return item.status === "settled";
      case "waived":
        return item.status === "waived";
      default:
        return true;
    }
  });

  return (
    <div className="space-y-3">
      {/* Accessible Tab Switcher */}
      <div
        role="tablist"
        aria-label="Obligation status filter"
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
          All Dues
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
            {obligations.length}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "unpaid"}
          onClick={() => setActiveTab("unpaid")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer shrink-0 ${
            activeTab === "unpaid"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Unpaid
          {unpaidCount > 0 && (
            <span className="rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 text-xs font-semibold">
              {unpaidCount}
            </span>
          )}
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
          Under Review
          {pendingCount > 0 && (
            <span className="rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 text-xs font-semibold">
              {pendingCount}
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "settled"}
          onClick={() => setActiveTab("settled")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer shrink-0 ${
            activeTab === "settled"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Settled
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
            {settledCount}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "waived"}
          onClick={() => setActiveTab("waived")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer shrink-0 ${
            activeTab === "waived"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Waived
          {waivedCount > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
              {waivedCount}
            </span>
          )}
        </button>
      </div>

      {/* Fixed Height Table Container with Sticky Header */}
      <div className="h-[28rem] overflow-auto overscroll-contain rounded-xl border border-border bg-card shadow-xs">
        {filteredObligations.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center">
            <CheckCircle2 className="size-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-foreground">
              No obligations found
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              {activeTab === "unpaid"
                ? "No unpaid obligations are due in this scope."
                : "No dues match the selected filter."}
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-muted text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <tr>
                <th scope="col" className="px-5 py-3">
                  Description
                </th>
                <th scope="col" className="px-5 py-3">
                  Category
                </th>
                <th scope="col" className="px-5 py-3">
                  Term
                </th>
                <th scope="col" className="px-5 py-3 text-right">
                  Amount
                </th>
                <th scope="col" className="px-5 py-3 text-center">
                  Standing
                </th>
                <th scope="col" className="px-5 py-3 text-right">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredObligations.map((item) => (
                <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                  {/* Description */}
                  <td className="px-5 py-3.5">
                    <div className="font-medium text-foreground">
                      {item.description}
                    </div>
                    {item.is_past_semester && (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400 mt-0.5">
                        <AlertCircle className="size-3" />
                        Prior Term Carryover
                      </span>
                    )}
                  </td>

                  {/* Category */}
                  <td className="px-5 py-3.5">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${
                        item.kind === "fee"
                          ? "bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20"
                          : "bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-500/20"
                      }`}
                    >
                      {item.kind}
                      {item.consequence_outcome ? ` · ${item.consequence_outcome}` : ""}
                    </span>
                  </td>

                  {/* Term */}
                  <td className="px-5 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                    {item.semester_code || "—"}
                  </td>

                  {/* Amount */}
                  <td className="px-5 py-3.5 text-right font-mono font-medium text-foreground whitespace-nowrap">
                    {formatPhp(item.amount)}
                  </td>

                  {/* Standing Badge */}
                  <td className="px-5 py-3.5 text-center whitespace-nowrap">
                    {item.status === "settled" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="size-3" />
                        Settled
                      </span>
                    )}
                    {item.status === "pending_verification" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-400 border border-indigo-500/20">
                        <Clock className="size-3" />
                        Under Review
                      </span>
                    )}
                    {item.status === "waived" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/10 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-500/20">
                        <ShieldCheck className="size-3" />
                        Waived
                      </span>
                    )}
                    {item.status === "unpaid" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400 border border-amber-500/20">
                        <AlertCircle className="size-3" />
                        Unpaid
                      </span>
                    )}
                  </td>

                  {/* Details / Action */}
                  <td className="px-5 py-3.5 text-right whitespace-nowrap">
                    {item.status === "waived" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setInspectingWaiver(item)}
                        className="h-7 px-2 text-xs font-normal text-muted-foreground hover:text-foreground"
                      >
                        <Info className="size-3.5 mr-1" />
                        Waiver Info
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

      {/* Modal Dialog for Waiver Attribution Details */}
      {inspectingWaiver && (
        <Dialog
          open={Boolean(inspectingWaiver)}
          onOpenChange={(open) => {
            if (!open) setInspectingWaiver(null);
          }}
        >
          <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-emerald-600" />
                Official Council Waiver
              </DialogTitle>
              <DialogDescription>
                This obligation was officially waived by the Student Council.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-sm">
              <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1.5">
                <div className="text-xs text-muted-foreground">Obligation</div>
                <div className="font-semibold text-foreground">
                  {inspectingWaiver.description}
                </div>
                <div className="text-xs font-mono text-muted-foreground">
                  Original Amount: {formatPhp(inspectingWaiver.amount)}
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  Waiver Date
                </div>
                <div className="text-foreground">
                  {inspectingWaiver.waived_at
                    ? formatPhDate(inspectingWaiver.waived_at)
                    : "Recorded"}
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  Reason for Waiver
                </div>
                <div className="rounded-lg border border-border bg-background p-2.5 text-xs text-foreground italic">
                  &ldquo;{inspectingWaiver.waiver_reason || "Approved council waiver."}&rdquo;
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
