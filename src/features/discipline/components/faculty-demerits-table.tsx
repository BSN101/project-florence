"use client";

import { useMemo, useState } from "react";
import { AlertCircle, FileWarning, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { formatManilaDate, formatManilaDateTime } from "@/lib/manila-date";

import type { FacultyDemeritUnitRecord } from "../contracts";
import { DEMERIT_STATUS_OPTIONS } from "./demerits-table";
import { BucketBadge, DemeritStatusBadge } from "./disciplinary-badges";
import {
  BUCKET_OPTIONS,
  FilterSelect,
  matches,
  TableEmpty,
  TableFrame,
  THEAD_CLASS,
  usePagedRows,
} from "./table-controls";
import { WaiveDemeritDialog } from "./waive-demerit-dialog";

export function FacultyDemeritsTable({
  demerits,
  semesterLabel,
  isCurrentSemester,
}: {
  demerits: FacultyDemeritUnitRecord[];
  semesterLabel: string;
  isCurrentSemester: boolean;
}) {
  const [search, setSearch] = useState("");
  const [bucket, setBucket] = useState("all");
  const [status, setStatus] = useState("all");

  const hasAnyWaivable = useMemo(() => demerits.some((d) => d.canWaive), [demerits]);

  const normalizedSearch = search.trim().toLowerCase();
  const rows = useMemo(() => {
    return demerits.filter((d) => {
      if (!matches(bucket, d.bucket)) return false;
      if (!matches(status, d.waived_at ? "waived" : "active")) return false;
      if (!normalizedSearch) return true;
      const name = (d.student_name ?? "").toLowerCase();
      const num = (d.student_university_id ?? "").toLowerCase();
      const desc = d.description.toLowerCase();
      const reason = (d.waiver_reason ?? "").toLowerCase();
      return (
        name.includes(normalizedSearch) ||
        num.includes(normalizedSearch) ||
        desc.includes(normalizedSearch) ||
        reason.includes(normalizedSearch)
      );
    });
  }, [demerits, normalizedSearch, bucket, status]);

  const { pageRows, pager } = usePagedRows(
    rows,
    `${semesterLabel}:${bucket}:${status}:${normalizedSearch}`
  );

  const filters = (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full max-w-xs">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          placeholder="Filter by student, violation, or note..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 sm:h-8 sm:text-xs max-sm:min-h-11 pointer-coarse:min-h-11"
          aria-label="Filter demerits by student, violation, or note"
        />
      </div>
      <div className="flex items-center gap-2">
        <FilterSelect label="Bucket" value={bucket} options={BUCKET_OPTIONS} onChange={setBucket} />
        <FilterSelect
          label="Status"
          value={status}
          options={DEMERIT_STATUS_OPTIONS}
          onChange={setStatus}
        />
      </div>
    </div>
  );

  if (rows.length === 0) {
    return (
      <TableFrame filters={filters} pager={pager}>
        <TableEmpty
          icon={FileWarning}
          title="No demerits logged"
          text="Demerit units you issue to enrolled students in this semester will appear here."
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
            <th className="px-4 py-3">Incident Date</th>
            <th className="px-4 py-3">Bucket</th>
            <th className="px-4 py-3">Violation &amp; Waiver Details</th>
            <th className="px-4 py-3">Status</th>
            {hasAnyWaivable && <th className="px-4 py-3 text-right">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {pageRows.map((d) => {
            const isWaived = d.waived_at !== null;
            const unitLabel =
              d.group_unit_count > 1
                ? `Unit ${d.incident_unit_index} of ${d.group_unit_count}`
                : null;

            return (
              <tr key={d.id} className="hover:bg-muted/30">
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium text-foreground">
                      {d.student_name ?? "Student"}
                    </span>
                    {d.student_university_id && (
                      <span className="font-mono text-[11px] text-primary">
                        {d.student_university_id}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                  {formatManilaDate(d.incident_on)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <BucketBadge bucket={d.bucket} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex max-w-md flex-col gap-1">
                    <span className="whitespace-normal break-words font-medium text-foreground">
                      {d.description}
                    </span>
                    {unitLabel && (
                      <span className="text-[11px] text-muted-foreground">{unitLabel}</span>
                    )}
                    {isWaived && d.waiver_reason && (
                      <div className="mt-1 flex items-start gap-2 rounded-lg border border-border/60 bg-muted/60 p-2 text-[11px] text-muted-foreground">
                        <AlertCircle className="mt-1 size-3 shrink-0 text-primary" aria-hidden="true" />
                        <div className="min-w-0 space-y-1">
                          <p className="whitespace-normal break-words">
                            <span className="font-medium text-foreground">Waiver reason:</span>{" "}
                            {d.waiver_reason}
                          </p>
                          <p>
                            {d.waived_by_name ? `Waived by ${d.waived_by_name} · ` : "Waived "}
                            <span suppressHydrationWarning>{formatManilaDateTime(d.waived_at)}</span>
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <DemeritStatusBadge waived={isWaived} />
                </td>
                {hasAnyWaivable && (
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {d.canWaive ? (
                      <WaiveDemeritDialog
                        demerit={{
                          id: d.id,
                          student_name: d.student_name ?? null,
                          student_university_id: d.student_university_id ?? null,
                          bucket: d.bucket,
                          source: "faculty",
                          description: d.description,
                          incident_on: d.incident_on,
                          unitLabel,
                        }}
                        semesterLabel={semesterLabel}
                        isCurrentSemester={isCurrentSemester}
                      />
                    ) : (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableFrame>
  );
}
