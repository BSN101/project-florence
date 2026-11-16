"use client";

import { useMemo, useState } from "react";
import { Award, Calendar, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { FacultyMeritGroup } from "../contracts";
import { TableEmpty, TableFrame, THEAD_CLASS, usePagedRows } from "./table-controls";

export function FacultyMeritsTable({
  merits,
}: {
  merits: FacultyMeritGroup[];
}) {
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return merits;
    return merits.filter((m) => {
      const name = (m.student_name ?? "").toLowerCase();
      const num = (m.student_university_id ?? "").toLowerCase();
      const desc = m.description.toLowerCase();
      return name.includes(q) || num.includes(q) || desc.includes(q);
    });
  }, [merits, search]);

  const { pageRows, pager } = usePagedRows(rows, search);

  const filters = (
    <div className="relative w-full max-w-xs">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        placeholder="Filter by student or reason..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-8 pl-8 text-xs"
        aria-label="Filter merits by student or reason"
      />
    </div>
  );

  if (rows.length === 0) {
    return (
      <TableFrame filters={filters} pager={pager}>
        <TableEmpty
          icon={Award}
          title="No merit awards issued"
          text="Direct merits you award to enrolled students in this semester will appear here."
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
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold text-foreground">
                    {m.student_name ?? "Student"}
                  </span>
                  {m.student_university_id && (
                    <span className="font-mono text-[11px] text-primary">
                      {m.student_university_id}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                  <Award className="size-3" />
                  <span>
                    {m.days} {m.days === 1 ? "day" : "days"}
                  </span>
                </span>
              </td>
              <td className="px-4 py-3 font-mono text-muted-foreground whitespace-nowrap">
                {m.awarded_on}
              </td>
              <td className="px-4 py-3 font-mono text-muted-foreground whitespace-nowrap">
                <div className="flex items-center gap-1.5 text-[11px]">
                  <Calendar className="size-3 text-muted-foreground/70" />
                  <span>Valid until {m.expires_on}</span>
                </div>
              </td>
              <td className="px-4 py-3">
                <span className="font-medium text-foreground">{m.description}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableFrame>
  );
}
