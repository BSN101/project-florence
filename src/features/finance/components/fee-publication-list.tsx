"use client";

import { History, Send } from "lucide-react";
import type { FeePublicationDTO } from "../contracts";

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

function formatManilaDate(isoString: string) {
  return new Date(isoString).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Manila",
  });
}

export function FeePublicationList({
  publications,
}: {
  publications: FeePublicationDTO[];
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
            <History className="size-5 text-muted-foreground" />
            Publication History
          </h3>
          <p className="text-sm text-muted-foreground">
            Snapshot record of fees published to students in this semester.
          </p>
        </div>
      </div>

      {publications.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-8 text-center">
          <Send className="size-8 text-muted-foreground/60 mb-2" />
          <p className="text-sm font-medium text-foreground">No fee publications recorded</p>
          <p className="text-xs text-muted-foreground max-w-sm mt-1">
            When fee obligations are published to students, immutable snapshots of the audience and amounts will appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs font-semibold uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Fee / Description</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Target Audience</th>
                  <th className="px-4 py-3">Published At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {publications.map((pub) => (
                  <tr key={pub.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {pub.description}
                    </td>
                    <td className="px-4 py-3 font-semibold text-foreground">
                      {currencyFormatter.format(pub.amount)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <div className="flex flex-col gap-0.5 text-xs">
                        <span>
                          <strong className="text-foreground">Years:</strong>{" "}
                          {pub.year_levels.map((y) => `Yr ${y}`).join(", ")}
                        </span>
                        <span className="capitalize">
                          <strong className="text-foreground">Status:</strong>{" "}
                          {pub.academic_statuses.join(", ")}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {formatManilaDate(pub.published_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

