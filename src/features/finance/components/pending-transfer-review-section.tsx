"use client";

import { use, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatPhDate, formatPhp } from "../calculations";
import { canDecideTransferForStudent, type PendingTransferReviewDTO } from "../contracts";
import { DecideTransferDialog } from "./decide-transfer-dialog";

/**
 * Transfers waiting for Executive/Operations review (FL-025 / T-036). The list arrives as a
 * promise so the rest of the page renders first; the dialog opens over the list, which stays visible.
 */
export function PendingTransferReviewSection({
  reviews,
  actorProfileId,
}: {
  reviews: Promise<PendingTransferReviewDTO[] | null>;
  actorProfileId: string;
}) {
  const rows = use(reviews);
  // Holds the open review itself, so the dialog's result stays up after the row leaves the list.
  const [selected, setSelected] = useState<PendingTransferReviewDTO | null>(null);

  if (rows === null) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
        <div className="font-semibold">Unable to load pending transfers</div>
        <p className="mt-1 text-xs">Refresh the page to try again.</p>
      </div>
    );
  }

  return (
    <section aria-labelledby="pending-transfers-title" className="space-y-3">
      <h2 id="pending-transfers-title" className="section-title">
        Transfers awaiting review{rows.length > 0 ? ` (${rows.length})` : ""}
      </h2>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          No transfers are waiting for review in this semester.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {rows.map((row) => {
            const canDecide = canDecideTransferForStudent(actorProfileId, row.student_id);
            return (
              <li key={row.id} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 space-y-0.5">
                  <div className="truncate text-sm font-medium text-foreground">{row.student.fullName}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {row.student.universityId ? `${row.student.universityId} · ` : ""}
                    Ref {row.reference_number ?? "—"} · {formatPhDate(row.submitted_at)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {formatPhp(Number(row.amount))}
                  </span>
                  {canDecide ? (
                    <Button type="button" variant="outline" onClick={() => setSelected(row)} className="min-h-11">
                      Review
                    </Button>
                  ) : (
                    <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                      Your submission
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {selected && <DecideTransferDialog key={selected.id} review={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}
