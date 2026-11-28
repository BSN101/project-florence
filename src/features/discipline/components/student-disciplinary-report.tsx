"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useTransition } from "react";
import { ArrowLeft, Download, LoaderCircle, Printer } from "lucide-react";

import { RefreshButton } from "@/components/layout/refresh-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatManilaDate, formatManilaDateTime } from "@/lib/manila-date";
import { cn } from "@/lib/utils";

import type { StudentDisciplinaryReportData } from "../report-contracts";
import { BucketBadge } from "./disciplinary-badges";
import { StudentDisciplinaryReportTables } from "./student-disciplinary-report-tables";

const formatDays = (count: number) => `${count} ${count === 1 ? "day" : "days"}`;

function buildReportViewHref(input: {
  scope: "semester" | "year";
  year?: number;
  semesterQueryParam?: string;
}): string {
  const params = new URLSearchParams();
  params.set("report", input.scope);
  if (input.scope === "year" && input.year !== undefined) {
    params.set("year", String(input.year));
  }
  if (input.semesterQueryParam) {
    params.set("semester", input.semesterQueryParam);
  }
  return `/student/merits-demerits-and-services?${params.toString()}`;
}

export function StudentDisciplinaryReport({
  report,
  backHref,
  csvHref,
  semesterQueryParam,
}: {
  report: StudentDisciplinaryReportData;
  backHref: string;
  csvHref: string;
  semesterQueryParam?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const yearSelectId = useId();

  useEffect(() => {
    document.body.dataset.printDocumentActive = "true";
    return () => {
      delete document.body.dataset.printDocumentActive;
    };
  }, []);

  const semesterScopeHref = buildReportViewHref({
    scope: "semester",
    semesterQueryParam,
  });
  const yearScopeHref = buildReportViewHref({
    scope: "year",
    year: report.academicYearStart,
    semesterQueryParam,
  });

  function navigateToScope(href: string) {
    if (isPending) return;
    startTransition(() => {
      router.push(href);
    });
  }

  function handleYearChange(nextYearRaw: string) {
    const parsed = Number.parseInt(nextYearRaw, 10);
    if (!Number.isInteger(parsed) || parsed === report.academicYearStart || isPending) return;
    navigateToScope(
      buildReportViewHref({
        scope: "year",
        year: parsed,
        semesterQueryParam,
      })
    );
  }

  const { office, rle, merits } = report.cumulativeSummary;
  const { periodSummary } = report;
  const enrolledTerms = report.coveredTerms.filter(
    (term) => term.yearLevel !== null && term.academicStatus !== null
  );

  return (
    <div data-print-document className="flex w-full flex-col gap-6">
      {/* Non-print navigation, scope controls, and export bar */}
      <div
        data-print-chrome
        className="flex w-full flex-col gap-4 print:hidden"
        aria-busy={isPending}
      >
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link href={backHref} />}
            className="w-fit gap-2 text-xs max-sm:min-h-11 pointer-coarse:min-h-11"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            <span>Back to conduct ledger</span>
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            <RefreshButton renderedAt={report.generatedAt} />

            <a
              href={csvHref}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "gap-2 text-xs max-sm:min-h-11 pointer-coarse:min-h-11"
              )}
            >
              <Download className="size-4" aria-hidden="true" />
              <span>Download CSV</span>
            </a>

            <Button
              type="button"
              size="sm"
              onClick={() => window.print()}
              className="gap-2 text-xs max-sm:min-h-11 pointer-coarse:min-h-11"
            >
              <Printer className="size-4" aria-hidden="true" />
              <span>Print / Save as PDF</span>
            </Button>
          </div>
        </div>

        <Card className="flex w-full flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Report period:</span>
            <div
              role="group"
              aria-label="Report period scope"
              className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-background p-1"
            >
              <Button
                type="button"
                variant={report.scope === "semester" ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={report.scope === "semester"}
                disabled={isPending}
                onClick={() => {
                  if (report.scope !== "semester") navigateToScope(semesterScopeHref);
                }}
                className="text-xs max-sm:min-h-11 pointer-coarse:min-h-11"
              >
                Selected semester
              </Button>
              <Button
                type="button"
                variant={report.scope === "year" ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={report.scope === "year"}
                disabled={isPending}
                onClick={() => {
                  if (report.scope !== "year") navigateToScope(yearScopeHref);
                }}
                className="text-xs max-sm:min-h-11 pointer-coarse:min-h-11"
              >
                Academic year
              </Button>
            </div>

            {isPending && (
              <span
                role="status"
                className="inline-flex items-center gap-2 text-xs text-muted-foreground"
              >
                <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden="true" />
                <span>Updating report…</span>
              </span>
            )}
          </div>

          {report.scope === "year" && (
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor={yearSelectId} className="text-xs font-medium text-foreground">
                Academic year
              </label>
              <select
                id={yearSelectId}
                value={String(report.academicYearStart)}
                disabled={isPending}
                onChange={(event) => handleYearChange(event.target.value)}
                className="h-10 max-w-full rounded-lg border border-input bg-background px-2 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 md:text-sm pointer-coarse:text-base max-sm:min-h-11 pointer-coarse:min-h-11"
              >
                {report.availableAcademicYears.map((option) => (
                  <option key={option.academicYearStart} value={String(option.academicYearStart)}>
                    {option.label} ({option.termCount} {option.termCount === 1 ? "term" : "terms"})
                  </option>
                ))}
              </select>
            </div>
          )}
        </Card>
      </div>

      {/* Plain Document Header */}
      <Card data-print-avoid-break className="flex w-full flex-col gap-4 p-4 sm:p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Project Florence · Faculty of Nursing
            </p>
            <h2 className="section-title mt-1">Student Disciplinary Report</h2>
          </div>
          <span className="text-xs font-medium text-foreground tabular-nums">
            {report.scope === "year" ? "Academic Year Scope" : "Single Semester Scope"} ·{" "}
            {report.periodLabel}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 border-t border-border/60 pt-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground">Student</span>
            <span className="whitespace-normal break-words font-medium text-foreground">
              {report.student.fullName}
            </span>
            <span className="font-mono text-muted-foreground tabular-nums">
              {report.student.universityId ?? "—"}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground">Covered Terms</span>
            {report.coveredTerms.map((term) => (
              <span
                key={`${term.academicYearStart}-${term.term}`}
                className="whitespace-normal break-words text-foreground tabular-nums"
              >
                <span className="font-medium">{term.term}</span> (
                {formatManilaDate(term.startsOn)} – {formatManilaDate(term.endsOn)})
              </span>
            ))}
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground">Enrollment Context</span>
            {enrolledTerms.length === 0 ? (
              <span className="text-muted-foreground">No enrollment in selected period</span>
            ) : (
              enrolledTerms.map((term) => (
                <span
                  key={`enroll-${term.academicYearStart}-${term.term}`}
                  className="whitespace-normal break-words text-foreground tabular-nums"
                >
                  {report.coveredTerms.length > 1 ? `${term.term}: ` : ""}Year {term.yearLevel} ·{" "}
                  {term.academicStatus === "irregular" ? "Irregular" : "Regular"}
                </span>
              ))
            )}
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground">Generated (Asia/Manila)</span>
            <span
              className="font-medium text-foreground tabular-nums"
              suppressHydrationWarning
            >
              {formatManilaDateTime(report.generatedAt)}
            </span>
          </div>
        </div>

        <p className="border-t border-border/60 pt-4 text-xs text-muted-foreground">
          Informational record only. Not an official certified document.
        </p>
      </Card>

      {/* Current Cumulative Standing (All Semesters) */}
      <section data-print-avoid-break className="flex w-full flex-col gap-2">
        <div
          data-print-heading
          className="flex flex-col gap-1 break-after-avoid sm:flex-row sm:items-baseline sm:justify-between"
        >
          <h3 className="section-title break-after-avoid">Current Cumulative Standing</h3>
          <span className="text-xs text-muted-foreground tabular-nums">
            Cumulative across all semesters as of {formatManilaDate(report.asOfDateManila)}{" "}
            (Asia/Manila)
          </span>
        </div>

        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
          <Card data-print-avoid-break className="flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Office Duty Balance</span>
              <BucketBadge bucket="office" className="font-medium" />
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-heading text-2xl font-semibold tracking-tight text-foreground tabular-nums">
                {formatDays(Math.max(0, office.balance))}
              </span>
              <span
                className={cn(
                  "text-xs font-medium",
                  office.balance > 0 ? "text-destructive" : "text-success-foreground"
                )}
              >
                {office.balance > 0 ? "Sanction pending" : "Clear"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              {office.activeDemerits} active · {office.waivedDemerits} waived ·{" "}
              {office.appliedMerits} applied merits · {office.activeServiceCredits} duty credits
              {office.revokedServiceCredits > 0 ? ` (${office.revokedServiceCredits} revoked)` : ""}
            </p>
          </Card>

          <Card data-print-avoid-break className="flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Clinical (RLE) Duty Balance
              </span>
              <BucketBadge bucket="rle" className="font-medium" />
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-heading text-2xl font-semibold tracking-tight text-foreground tabular-nums">
                {formatDays(Math.max(0, rle.balance))}
              </span>
              <span
                className={cn(
                  "text-xs font-medium",
                  rle.balance > 0 ? "text-destructive" : "text-success-foreground"
                )}
              >
                {rle.balance > 0 ? "Sanction pending" : "Clear"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              {rle.activeDemerits} active · {rle.waivedDemerits} waived · {rle.appliedMerits}{" "}
              applied merits · {rle.activeServiceCredits} duty credits
              {rle.revokedServiceCredits > 0 ? ` (${rle.revokedServiceCredits} revoked)` : ""}
            </p>
          </Card>

          <Card data-print-avoid-break className="flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Available Merits</span>
              <span className="text-xs text-muted-foreground tabular-nums">1-yr validity</span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-heading text-2xl font-semibold tracking-tight text-foreground tabular-nums">
                {formatDays(merits.available)}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {merits.totalApplied} applied
              </span>
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              {merits.totalAwarded} total awarded · {merits.expired} expired
            </p>
          </Card>
        </div>
      </section>

      {/* Period Activity Summary */}
      <section data-print-avoid-break className="flex w-full flex-col gap-2">
        <div
          data-print-heading
          className="flex flex-col gap-1 break-after-avoid sm:flex-row sm:items-baseline sm:justify-between"
        >
          <h3 className="section-title break-after-avoid">Period Activity Summary</h3>
          <span className="text-xs text-muted-foreground tabular-nums">{report.periodLabel}</span>
        </div>

        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
          <Card data-print-avoid-break className="flex flex-col gap-1 p-4">
            <span className="text-xs font-medium text-muted-foreground">Demerits Recorded</span>
            <span className="font-heading text-xl font-semibold tracking-tight text-foreground tabular-nums">
              {formatDays(periodSummary.demeritsRecorded)}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {periodSummary.demeritsActive} active ({periodSummary.officeDemeritsActive} Office,{" "}
              {periodSummary.rleDemeritsActive} RLE)
              {" · "}
              {periodSummary.demeritsWaived} waived
            </span>
          </Card>

          <Card data-print-avoid-break className="flex flex-col gap-1 p-4">
            <span className="text-xs font-medium text-muted-foreground">Merits Awarded</span>
            <span className="font-heading text-xl font-semibold tracking-tight text-foreground tabular-nums">
              {formatDays(periodSummary.meritsAwarded)}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {periodSummary.meritsAvailable} available · {periodSummary.meritsApplied} applied ·{" "}
              {periodSummary.meritsExpired} expired
            </span>
          </Card>

          <Card data-print-avoid-break className="flex flex-col gap-1 p-4">
            <span className="text-xs font-medium text-muted-foreground">
              Service Credits Earned
            </span>
            <span className="font-heading text-xl font-semibold tracking-tight text-foreground tabular-nums">
              {formatDays(periodSummary.serviceCreditsEarned)}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {periodSummary.serviceCreditsActive} active · {periodSummary.serviceCreditsRevoked}{" "}
              revoked
            </span>
          </Card>
        </div>
      </section>

      {/* Period Tables */}
      <StudentDisciplinaryReportTables
        demerits={report.demerits}
        merits={report.merits}
        serviceCredits={report.serviceCredits}
        showTermColumn={report.scope === "year"}
      />
    </div>
  );
}
