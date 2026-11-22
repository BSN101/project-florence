"use client";

import { useState } from "react";
import { AlertCircle, Clock, User } from "lucide-react";
import type { ServiceCreditRecord } from "../contracts";
import { BucketBadge, ServiceCreditBadge } from "./disciplinary-badges";
import { BUCKET_OPTIONS, FilterSelect, matches, TableEmpty, TableFrame, THEAD_CLASS, usePagedRows } from "./table-controls";

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "revoked", label: "Revoked" },
];

export function ServiceCreditsTable({
  credits,
}: {
  credits: ServiceCreditRecord[];
}) {
  const [bucket, setBucket] = useState("all");
  const [status, setStatus] = useState("all");
  const rows = credits.filter(
    (c) => matches(bucket, c.bucket) && matches(status, c.revoked_at ? "revoked" : "active")
  );

  const filters = (
    <>
      <FilterSelect label="Bucket" value={bucket} options={BUCKET_OPTIONS} onChange={setBucket} />
      <FilterSelect label="Status" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
    </>
  );

  const { pageRows, pager } = usePagedRows(rows, `${bucket}|${status}`);

  if (rows.length === 0) {
    return (
      <TableFrame filters={filters} pager={pager}>
        <TableEmpty
          icon={Clock}
          title="No service duty credits recorded"
          text="Completed extension service duty sessions will appear here."
          filtered={credits.length > 0}
        />
      </TableFrame>
    );
  }

  return (
    <TableFrame filters={filters} pager={pager}>
      <table className="w-full min-w-[780px] table-fixed text-left text-xs">
        <colgroup>
          <col className="w-[18%]" />
          <col className="w-[16%]" />
          <col className="w-[28%]" />
          <col className="w-[38%]" />
        </colgroup>
        <thead className={THEAD_CLASS}>
          <tr>
            <th className="px-4.5 py-3.5 font-medium">Issued Date</th>
            <th className="px-4.5 py-3.5 font-medium">Duty Bucket</th>
            <th className="pl-4.5 pr-8 py-3.5 font-medium">Status</th>
            <th className="pl-8 pr-6 py-3.5 font-medium">Supervisor / Issuer</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {pageRows.map((c) => {
            const isRevoked = c.revoked_at !== null;
            return (
              <tr key={c.id} className="transition-colors hover:bg-muted/30">
                <td className="px-4.5 py-3.5 font-mono text-muted-foreground whitespace-nowrap">
                  {new Date(c.issued_at).toLocaleDateString("en-CA", {
                    timeZone: "Asia/Manila",
                  })}
                </td>
                <td className="px-4.5 py-3.5 whitespace-nowrap">
                  <BucketBadge bucket={c.bucket} />
                </td>
                <td className="pl-4.5 pr-8 py-3.5">
                  <div className="flex flex-col gap-1">
                    <ServiceCreditBadge revoked={isRevoked} />
                    {isRevoked && c.revocation_reason && (
                      <div className="flex items-start gap-1 rounded bg-muted/60 p-1.5 text-[11px] text-muted-foreground">
                        <AlertCircle className="size-3.5 text-destructive mt-0.5 shrink-0" />
                        <span>
                          <strong>Revocation note:</strong> {c.revocation_reason}
                        </span>
                      </div>
                    )}
                  </div>
                </td>
                <td className="pl-8 pr-6 py-3.5 text-muted-foreground whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <User className="size-3.5 text-muted-foreground/70 shrink-0" />
                    <span className="truncate">{c.issuer_name ?? "Instructor"}</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableFrame>
  );
}
