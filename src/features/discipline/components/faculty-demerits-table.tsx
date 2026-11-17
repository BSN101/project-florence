"use client";

import { useMemo, useState } from "react";
import { AlertCircle, FileWarning, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { FacultyDemeritGroup } from "../contracts";
import {
  BUCKET_OPTIONS,
  FilterSelect,
  matches,
  TableEmpty,
  TableFrame,
  THEAD_CLASS,
  usePagedRows,
} from "./table-controls";

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "waived", label: "Waived" },
];

export function FacultyDemeritsTable({
  demerits,
}: {
  demerits: FacultyDemeritGroup[];
}) {
  const [search, setSearch] = useState("");
  const [bucket, setBucket] = useState("all");
  const [status, setStatus] = useState("all");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return demerits.filter((d) => {
      const name = (d.student_name ?? "").toLowerCase();
      const num = (d.student_university_id ?? "").toLowerCase();
      const desc = d.description.toLowerCase();
      const label = (d.misconduct_label ?? "").toLowerCase();
      const matchesSearch = !q || name.includes(q) || num.includes(q) || desc.includes(q) || label.includes(q);
      const matchesBucket = matches(bucket, d.bucket);

      const hasActive = d.days - d.waivedDays > 0;
      const hasWaived = d.waivedDays > 0;
      const matchesStatus =
        status === "all" ||
        (status === "active" && hasActive) ||
        (status === "waived" && hasWaived);

      return matchesSearch && matchesBucket && matchesStatus;
    });
  }, [demerits, search, bucket, status]);

  const { pageRows, pager } = usePagedRows(rows, `${search}|${bucket}|${status}`);

  const filters = (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Filter by student, violation, or notes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 pl-8 text-xs"
          aria-label="Filter demerits by student or reason"
        />
      </div>
      <div className="flex items-center gap-2">
        <FilterSelect label="Bucket" value={bucket} options={BUCKET_OPTIONS} onChange={setBucket} />
        <FilterSelect label="Status" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
      </div>
    </div>
  );

  if (rows.length === 0) {
    return (
      <TableFrame filters={filters} pager={pager}>
        <TableEmpty
          icon={FileWarning}
          title="No demerits logged"
          text="Demerits you issue to enrolled students in this semester will appear here."
          filtered={demerits.length > 0}
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
            <th className="px-4 py-3">Bucket</th>
            <th className="px-4 py-3">Sanctioned Units</th>
            <th className="px-4 py-3">Violation</th>
            <th className="px-4 py-3">Incident Date</th>
            <th className="px-4 py-3">Description / Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {pageRows.map((d) => {
            const activeUnits = d.days - d.waivedDays;
            const isAllWaived = d.days > 0 && d.waivedDays === d.days;
            const isPartiallyWaived = d.waivedDays > 0 && d.waivedDays < d.days;

            return (
              <tr key={d.id} className="hover:bg-muted/30">
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold text-foreground">
                      {d.student_name ?? "Student"}
                    </span>
                    {d.student_university_id && (
                      <span className="font-mono text-[11px] text-primary">
                        {d.student_university_id}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider ${
                      d.bucket === "office"
                        ? "border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                        : "border border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-400"
                    }`}
                  >
                    {d.bucket}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        isAllWaived
                          ? "border border-muted bg-muted/60 text-muted-foreground line-through"
                          : "border border-destructive/20 bg-destructive/10 text-destructive"
                      }`}
                    >
                      <AlertCircle className="size-3" />
                      <span>
                        {d.days} {d.days === 1 ? "day" : "days"}
                      </span>
                    </span>
                    {isPartiallyWaived && (
                      <span className="text-[10px] text-muted-foreground">
                        ({activeUnits} active, {d.waivedDays} waived)
                      </span>
                    )}
                    {isAllWaived && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Waived
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="font-medium text-foreground">
                    {d.misconduct_label ?? "Misconduct"}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-muted-foreground whitespace-nowrap">
                  {d.incident_on}
                </td>
                <td className="px-4 py-3">
                  <span className="font-medium text-foreground">{d.description}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableFrame>
  );
}
