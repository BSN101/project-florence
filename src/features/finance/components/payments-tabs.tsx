"use client";

import { Suspense, use, useState, type ReactNode } from "react";
import { Clock, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PendingTransferReviewDTO } from "../contracts";

export type PaymentsTabId = "transfers" | "accounts";

function PendingCount({ reviews }: { reviews: Promise<PendingTransferReviewDTO[] | null> }) {
  const rows = use(reviews);
  if (!rows) return null;
  return <> ({rows.length})</>;
}

/**
 * Council Payments tabs matching the Council Conduct tab buttons. View-only state stays on the
 * client; the URL mirrors it with `history.replaceState`. Both panels stay mounted so filters
 * and open dialogs survive a switch.
 */
export function PaymentsTabs({
  initialTab,
  transfers,
  accounts,
  pendingReviews,
  studentCount,
}: {
  initialTab: PaymentsTabId;
  transfers: ReactNode;
  accounts: ReactNode;
  pendingReviews?: Promise<PendingTransferReviewDTO[] | null>;
  studentCount?: number;
}) {
  const [activeTab, setActiveTab] = useState<PaymentsTabId>(initialTab);

  function select(next: PaymentsTabId) {
    setActiveTab(next);
    const url = new URL(window.location.href);
    if (next === "transfers") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(window.history.state, "", url);
  }

  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label="Payments" className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
        <Button
          type="button"
          role="tab"
          id="payments-tab-transfers"
          aria-selected={activeTab === "transfers"}
          aria-controls="payments-panel-transfers"
          variant={activeTab === "transfers" ? "default" : "ghost"}
          size="sm"
          onClick={() => select("transfers")}
          className="gap-2 text-xs"
        >
          <Clock className="size-3.5" />
          <span>
            Transfers Awaiting Review
            {pendingReviews && (
              <Suspense fallback={null}>
                <PendingCount reviews={pendingReviews} />
              </Suspense>
            )}
          </span>
        </Button>

        <Button
          type="button"
          role="tab"
          id="payments-tab-accounts"
          aria-selected={activeTab === "accounts"}
          aria-controls="payments-panel-accounts"
          variant={activeTab === "accounts" ? "default" : "ghost"}
          size="sm"
          onClick={() => select("accounts")}
          className="gap-2 text-xs"
        >
          <Users className="size-3.5" />
          <span>
            Student Financial Accounts &amp; Payments
            {typeof studentCount === "number" ? ` (${studentCount})` : ""}
          </span>
        </Button>
      </div>

      <div
        role="tabpanel"
        id="payments-panel-transfers"
        aria-labelledby="payments-tab-transfers"
        hidden={activeTab !== "transfers"}
      >
        {transfers}
      </div>
      <div
        role="tabpanel"
        id="payments-panel-accounts"
        aria-labelledby="payments-tab-accounts"
        hidden={activeTab !== "accounts"}
      >
        {accounts}
      </div>
    </div>
  );
}
