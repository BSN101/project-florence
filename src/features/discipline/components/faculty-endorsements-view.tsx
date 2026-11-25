"use client";

import { useMemo, useState } from "react";
import { Award, CheckCircle2, Clock, Info, Search, XCircle } from "lucide-react";

import { RefreshButton } from "@/components/layout/refresh-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import {
  countFacultyEndorsements,
  formatManilaDate,
  formatManilaDateTime,
} from "../calculations";
import type { FacultyMeritEndorsementRecord } from "../contracts";
import { EndorsementStatusBadge } from "./disciplinary-badges";
import { EndorsementDecisionDialog } from "./endorsement-decision-dialog";
import {
  FilterSelect,
  matches,
  TableEmpty,
  TableFrame,
  THEAD_CLASS,
  usePagedRows,
} from "./table-controls";

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

export function FacultyEndorsementsView({
  endorsements,
  semesterLabel,
  isCurrentSemester,
  todayManila,
  expiresOnManila,
  renderedAt,
}: {
  endorsements: FacultyMeritEndorsementRecord[];
  semesterLabel: string;
  isCurrentSemester: boolean;
  todayManila: string;
  expiresOnManila: string;
  renderedAt: string;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const counts = useMemo(() => countFacultyEndorsements(endorsements), [endorsements]);
  const hasAnyDecidable = useMemo(
    () => endorsements.some((e) => e.canDecide),
    [endorsements]
  );

  const normalizedSearch = search.trim().toLowerCase();
  const rows = useMemo(() => {
    return endorsements.filter((e) => {
      if (!matches(status, e.status)) return false;
      if (!normalizedSearch) return true;
      const name = (e.student_name ?? "").toLowerCase();
      const num = (e.student_university_id ?? "").toLowerCase();
      const desc = e.description.toLowerCase();
      return (
        name.includes(normalizedSearch) ||
        num.includes(normalizedSearch) ||
        desc.includes(normalizedSearch)
      );
    });
  }, [endorsements, normalizedSearch, status]);

  const { pageRows, pager } = usePagedRows(rows, `${status}:${normalizedSearch}`);

  const filters = (
    <div className="flex w-full flex-wrap items-center gap-2">
      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Filter by student or basis..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 pl-8 text-xs"
          aria-label="Filter endorsements by student or basis"
        />
      </div>
      <FilterSelect label="Status" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
    </div>
  );

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Header Row */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-lg font-medium text-foreground">
            Assigned Endorsements
          </h2>
          <p className="text-xs text-muted-foreground">
            Review Council merit recommendations assigned to you in{" "}
            <strong className="font-medium text-foreground">{semesterLabel}</strong>.
          </p>
        </div>
        <RefreshButton renderedAt={renderedAt} />
      </div>

      {/* Historical Semester Callout */}
      {!isCurrentSemester && counts.pending > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <p className="leading-relaxed">
            Pending endorsements assigned to you in{" "}
            <strong className="font-medium text-foreground">{semesterLabel}</strong> remain
            decidable. Approving records merit units dated today ({formatManilaDate(todayManila)},
            valid until {formatManilaDate(expiresOnManila)}) while keeping {semesterLabel}{" "}
            attribution.
          </p>
        </div>
      )}

      {/* Domain-Exact KPI Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border border-border/70 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Pending Endorsements
            </CardTitle>
            <Clock className="size-4 text-amber-700" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <p className="font-heading text-2xl font-semibold tabular-nums text-foreground">
              {counts.pending}
            </p>
          </CardContent>
        </Card>

        <Card className="border border-border/70 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Approved Endorsements
            </CardTitle>
            <CheckCircle2 className="size-4 text-emerald-700" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <p className="font-heading text-2xl font-semibold tabular-nums text-foreground">
              {counts.approved}
            </p>
          </CardContent>
        </Card>

        <Card className="border border-border/70 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Rejected Endorsements
            </CardTitle>
            <XCircle className="size-4 text-destructive" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <p className="font-heading text-2xl font-semibold tabular-nums text-foreground">
              {counts.rejected}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Endorsements Table */}
      {rows.length === 0 ? (
        <TableFrame filters={filters} pager={pager}>
          <TableEmpty
            icon={Award}
            title="No assigned merit endorsements"
            text="Council merit recommendations assigned to you in this semester will appear here."
            filtered={endorsements.length > 0}
          />
        </TableFrame>
      ) : (
        <TableFrame filters={filters} pager={pager}>
          <table className="w-full text-left text-xs">
            <thead className={THEAD_CLASS}>
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Basis / Submitted</th>
                <th className="px-4 py-3">Requested</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Decision / Outcome</th>
                {hasAnyDecidable && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {pageRows.map((e) => {
                const trimmedReason = e.decision_reason?.trim();
                const awardedDays = e.awarded_days || e.requested_days;

                return (
                  <tr key={e.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span className="font-medium text-foreground">
                          {e.student_name ?? "Student"}
                        </span>
                        {e.student_university_id && (
                          <span className="font-mono text-[11px] text-primary">
                            {e.student_university_id}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex max-w-xs flex-col gap-1">
                        <span className="whitespace-normal break-words font-medium text-foreground">
                          {e.description}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          Submitted by {e.submitter_name ?? "Council"} ·{" "}
                          <span suppressHydrationWarning>{formatManilaDateTime(e.submitted_at)}</span>
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap font-medium tabular-nums text-foreground">
                      {e.requested_days} {e.requested_days === 1 ? "day" : "days"}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <EndorsementStatusBadge status={e.status} />
                    </td>

                    <td className="px-4 py-3 text-muted-foreground">
                      {e.status === "approved" && (
                        <div className="flex flex-col gap-1 text-[11px]">
                          <span className="flex items-center gap-2 font-medium text-emerald-700">
                            <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
                            <span>
                              Approved · {awardedDays} {awardedDays === 1 ? "day" : "days"} awarded
                            </span>
                          </span>
                          {e.awarded_on && e.expires_on && (
                            <span className="text-muted-foreground">
                              Awarded {formatManilaDate(e.awarded_on)} · Valid until{" "}
                              {formatManilaDate(e.expires_on)}
                            </span>
                          )}
                          {e.decided_at && (
                            <span className="text-muted-foreground" suppressHydrationWarning>
                              Decided {formatManilaDateTime(e.decided_at)}
                            </span>
                          )}
                        </div>
                      )}

                      {e.status === "rejected" && (
                        <div className="flex flex-col gap-1 text-[11px]">
                          <span className="flex items-center gap-2 font-medium text-destructive">
                            <XCircle className="size-3.5 shrink-0" aria-hidden="true" />
                            <span>Rejected</span>
                          </span>
                          {trimmedReason && (
                            <div className="max-w-xs whitespace-normal break-words rounded bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground">
                              <strong className="font-medium text-foreground">Reason:</strong>{" "}
                              {trimmedReason}
                            </div>
                          )}
                          {e.decided_at && (
                            <span className="text-muted-foreground" suppressHydrationWarning>
                              Decided {formatManilaDateTime(e.decided_at)}
                            </span>
                          )}
                        </div>
                      )}

                      {e.status === "pending" && (
                        <span className="text-[11px] italic text-muted-foreground">
                          Awaiting your decision
                        </span>
                      )}
                    </td>

                    {hasAnyDecidable && (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {e.canDecide ? (
                          <div className="inline-flex items-center justify-end gap-2">
                            <EndorsementDecisionDialog
                              decision="approved"
                              endorsement={e}
                              semesterLabel={semesterLabel}
                              isCurrentSemester={isCurrentSemester}
                              todayManila={todayManila}
                              expiresOnManila={expiresOnManila}
                            />
                            <EndorsementDecisionDialog
                              decision="rejected"
                              endorsement={e}
                              semesterLabel={semesterLabel}
                              isCurrentSemester={isCurrentSemester}
                              todayManila={todayManila}
                              expiresOnManila={expiresOnManila}
                            />
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableFrame>
      )}
    </div>
  );
}
