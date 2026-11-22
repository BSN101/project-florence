"use client";

import { useState } from "react";
import { Award, Calendar, User } from "lucide-react";
import type { MeritRecord } from "../contracts";
import { MeritStatusBadge } from "./disciplinary-badges";
import { FilterSelect, matches, TableEmpty, TableFrame, THEAD_CLASS, usePagedRows } from "./table-controls";

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "available", label: "Available" },
  { value: "applied", label: "Applied" },
  { value: "expired", label: "Expired" },
];

const SOURCE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "direct", label: "Direct" },
  { value: "endorsement", label: "Endorsement" },
  { value: "external_ci", label: "External CI" },
];

const meritStatus = (m: MeritRecord) => (m.isApplied ? "applied" : m.isExpired ? "expired" : "available");

export function MeritsTable({
  merits,
}: {
  merits: MeritRecord[];
}) {
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  // Ordinary instructors cannot see merit applications, so their rows carry no status.
  const hasStatus = merits.some((m) => m.isApplied !== undefined);
  const rows = merits.filter(
    (m) => (!hasStatus || matches(status, meritStatus(m))) && matches(source, m.source)
  );

  const filters = (
    <>
      {hasStatus && <FilterSelect label="Status" value={status} options={STATUS_OPTIONS} onChange={setStatus} />}
      <FilterSelect label="Source" value={source} options={SOURCE_OPTIONS} onChange={setSource} />
    </>
  );

  const { pageRows, pager } = usePagedRows(rows, `${status}|${source}`);

  if (rows.length === 0) {
    return (
      <TableFrame filters={filters} pager={pager}>
        <TableEmpty
          icon={Award}
          title="No merit awards recorded"
          text="Merits earned for voluntary service or outstanding performance will appear here."
          filtered={merits.length > 0}
        />
      </TableFrame>
    );
  }

  return (
    <TableFrame filters={filters} pager={pager}>
      <table className="w-full min-w-[720px] table-fixed text-left text-xs">
        <colgroup>
          <col className="w-[16%]" />
          <col className="w-[34%]" />
          <col className="w-[20%]" />
          <col className="w-[12%]" />
          <col className="w-[18%]" />
        </colgroup>
        <thead className={THEAD_CLASS}>
          <tr>
            <th className="px-4.5 py-3.5 font-medium">Award Date</th>
            <th className="px-4.5 py-3.5 font-medium">Description</th>
            <th className="px-4.5 py-3.5 font-medium">Validity / Expiry</th>
            <th className="px-4.5 py-3.5 font-medium">Status</th>
            <th className="px-4.5 py-3.5 font-medium">Awarded By / Source</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {pageRows.map((m) => (
            <tr key={m.id} className="transition-colors hover:bg-muted/30">
              <td className="px-4.5 py-3.5 font-mono text-muted-foreground whitespace-nowrap">
                {m.awarded_on}
              </td>
              <td className="px-4.5 py-3.5">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium text-foreground leading-relaxed">{m.description}</span>
                  <span className="text-[11px] text-muted-foreground capitalize">
                    Source: {m.source}
                  </span>
                </div>
              </td>
              <td className="px-4.5 py-3.5 font-mono text-muted-foreground whitespace-nowrap">
                <div className="flex items-center gap-1.5 text-[11px]">
                  <Calendar className="size-3.5 text-muted-foreground/70" />
                  <span>Valid until {m.expires_on}</span>
                </div>
              </td>
              <td className="px-4.5 py-3.5 whitespace-nowrap">
                {hasStatus ? (
                  <MeritStatusBadge
                    isApplied={m.isApplied}
                    isExpired={m.isExpired}
                    appliedBucket={m.appliedBucket}
                  />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-4.5 py-3.5 text-muted-foreground whitespace-nowrap">
                <div className="flex items-center gap-1.5">
                  <User className="size-3.5 text-muted-foreground/70" />
                  <span className="truncate">
                    {m.external_source_name
                      ? `External: ${m.external_source_name}`
                      : m.awarder_name ?? (m.source === "endorsement" ? "Council Endorsement" : "Clinical Instructor")}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableFrame>
  );
}
