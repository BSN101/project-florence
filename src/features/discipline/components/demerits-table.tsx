"use client";

import { useState } from "react";
import { AlertCircle, FileText, User } from "lucide-react";
import type { DemeritRecord } from "../contracts";
import { BucketBadge, DemeritStatusBadge } from "./disciplinary-badges";
import { BUCKET_OPTIONS, FilterSelect, matches, TableEmpty, TableFrame, THEAD_CLASS, usePagedRows } from "./table-controls";

export const DEMERIT_STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "waived", label: "Waived" },
];

const SOURCE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "faculty", label: "Faculty" },
  { value: "council", label: "Council" },
  { value: "external_ci", label: "External CI" },
];

export function DemeritsTable({
  demerits,
}: {
  demerits: DemeritRecord[];
}) {
  const [bucket, setBucket] = useState("all");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const rows = demerits.filter(
    (d) =>
      matches(bucket, d.bucket) &&
      matches(status, d.waived_at ? "waived" : "active") &&
      matches(source, d.source)
  );

  const filters = (
    <>
      <FilterSelect label="Bucket" value={bucket} options={BUCKET_OPTIONS} onChange={setBucket} />
      <FilterSelect label="Status" value={status} options={DEMERIT_STATUS_OPTIONS} onChange={setStatus} />
      <FilterSelect label="Source" value={source} options={SOURCE_OPTIONS} onChange={setSource} />
    </>
  );

  const { pageRows, pager } = usePagedRows(rows, `${bucket}|${status}|${source}`);

  if (rows.length === 0) {
    return (
      <TableFrame filters={filters} pager={pager}>
        <TableEmpty
          icon={FileText}
          title="No demerit records found"
          text="There are no disciplinary infractions logged for this period."
          filtered={demerits.length > 0}
        />
      </TableFrame>
    );
  }

  return (
    <TableFrame filters={filters} pager={pager}>
      <table className="w-full min-w-[720px] table-fixed text-left text-xs">
        <colgroup>
          <col className="w-[16%]" />
          <col className="w-[14%]" />
          <col className="w-[36%]" />
          <col className="w-[14%]" />
          <col className="w-[20%]" />
        </colgroup>
        <thead className={THEAD_CLASS}>
          <tr>
            <th className="px-4.5 py-3.5 font-medium">Incident Date</th>
            <th className="px-4.5 py-3.5 font-medium">Bucket</th>
            <th className="px-4.5 py-3.5 font-medium">Misconduct & Description</th>
            <th className="px-4.5 py-3.5 font-medium">Status</th>
            <th className="px-4.5 py-3.5 font-medium">Issuer / Source</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {pageRows.map((d) => {
            const isWaived = d.waived_at !== null;
            return (
              <tr key={d.id} className="transition-colors hover:bg-muted/30">
                <td className="px-4.5 py-3.5 font-mono text-muted-foreground whitespace-nowrap">
                  {d.incident_on}
                </td>
                <td className="px-4.5 py-3.5 whitespace-nowrap">
                  <BucketBadge bucket={d.bucket} />
                </td>
                <td className="px-4.5 py-3.5">
                  <div className="flex flex-col gap-1">
                    {d.misconduct_label && (
                      <span className="font-semibold text-foreground">
                        {d.misconduct_label}
                      </span>
                    )}
                    <span className="text-muted-foreground leading-relaxed">{d.description}</span>
                    {d.consequence_outcome && (
                      <span className="text-[11px] font-medium text-muted-foreground">
                        Council consequence:{" "}
                        <span className="capitalize">{d.consequence_outcome}</span> (unit #{d.source_unit_index ?? 1})
                      </span>
                    )}
                    {isWaived && d.waiver_reason && (
                      <div className="mt-1 flex items-start gap-1.5 rounded-lg border border-border/50 bg-muted/60 p-2 text-[11px] text-muted-foreground">
                        <AlertCircle className="size-3.5 text-primary mt-0.5 shrink-0" />
                        <span>
                          <strong>Waiver reason:</strong> {d.waiver_reason}
                          {d.waived_by_name && ` (by ${d.waived_by_name})`}
                        </span>
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-4.5 py-3.5 whitespace-nowrap">
                  <DemeritStatusBadge waived={isWaived} />
                </td>
                <td className="px-4.5 py-3.5 text-muted-foreground whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <User className="size-3.5 text-muted-foreground/70" />
                    <span className="truncate">
                      {d.external_source_name
                        ? `External: ${d.external_source_name}`
                        : d.issuer_name ?? (d.source === "council" ? "Council" : "Faculty")}
                    </span>
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
