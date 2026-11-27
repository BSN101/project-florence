"use client";

import { useMemo, useState } from "react";
import { Award, Calendar, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { formatManilaDate } from "@/lib/manila-date";

import type { ExternalCiMeritGroupRecord } from "../contracts";
import { TableEmpty, TableFrame, THEAD_CLASS, usePagedRows } from "./table-controls";

export function ExternalCiMeritsTable({
  merits,
  semesterLabel,
}: {
  merits: ExternalCiMeritGroupRecord[];
  semesterLabel: string;
}) {
  const [search, setSearch] = useState("");

  const normalizedSearch = search.trim().toLowerCase();
  const rows = useMemo(() => {
    if (!normalizedSearch) return merits;
    return merits.filter((m) => {
      const name = (m.student_name ?? "").toLowerCase();
      const num = (m.student_university_id ?? "").toLowerCase();
      const source = (m.external_source_name ?? "").toLowerCase();
      const enteredBy = (m.entered_by_name ?? "").toLowerCase();
      const desc = m.description.toLowerCase();
      return (
        name.includes(normalizedSearch) ||
        num.includes(normalizedSearch) ||
        source.includes(normalizedSearch) ||
        enteredBy.includes(normalizedSearch) ||
        desc.includes(normalizedSearch)
      );
    });
  }, [merits, normalizedSearch]);

  const { pageRows, pager } = usePagedRows(rows, `${semesterLabel}:${normalizedSearch}`);

  const filters = (
    <div className="relative w-full max-w-xs">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        type="search"
        placeholder="Filter by student, external CI, or reason..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="pl-9 sm:h-8 sm:text-xs max-sm:min-h-11 pointer-coarse:min-h-11"
        aria-label="Filter external CI merits by student, external CI, or reason"
      />
    </div>
  );

  if (rows.length === 0) {
    return (
      <TableFrame filters={filters} pager={pager}>
        <TableEmpty
          icon={Award}
          title="No external CI merits recorded"
          text="Externally attributed merits recorded by an RLE Coordinator for this semester will appear here."
          filtered={merits.length > 0}
        />
      </TableFrame>
    );
  }

  return (
    <TableFrame filters={filters} pager={pager}>
      <table className="w-full text-left text-xs">
        <thead className={THEAD_CLASS}>
          <tr>
            <th className="px-4 py-3">Student</th>
            <th className="px-4 py-3">External CI</th>
            <th className="px-4 py-3">Awarded Units</th>
            <th className="px-4 py-3">Award Date</th>
            <th className="px-4 py-3">Validity / Expiry</th>
            <th className="px-4 py-3">Basis / Description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {pageRows.map((m) => (
            <tr key={m.id} className="hover:bg-muted/30">
              <td className="px-4 py-3">
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-foreground">
                    {m.student_name ?? "Student"}
                  </span>
                  {m.student_university_id && (
                    <span className="font-mono text-[11px] text-primary">
                      {m.student_university_id}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex max-w-xs flex-col gap-1">
                  <span className="whitespace-normal break-words font-medium text-foreground">
                    {m.external_source_name ?? "External CI"}
                  </span>
                  {m.entered_by_name && (
                    <span className="whitespace-normal break-words text-[11px] text-muted-foreground">
                      Entered by {m.entered_by_name}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-700">
                  <Award className="size-4 shrink-0" aria-hidden="true" />
                  <span className="tabular-nums">
                    {m.days} {m.days === 1 ? "day" : "days"}
                  </span>
                </span>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                {formatManilaDate(m.awarded_on)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                <div className="flex items-center gap-2 text-[11px]">
                  <Calendar className="size-4 shrink-0 text-muted-foreground/70" aria-hidden="true" />
                  <span>Valid until {formatManilaDate(m.expires_on)}</span>
                </div>
              </td>
              <td className="px-4 py-3">
                <span className="block max-w-md whitespace-normal break-words font-medium text-foreground">
                  {m.description}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableFrame>
  );
}
