"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CalendarX,
  Check,
  CheckCircle2,
  GraduationCap,
  History,
  Stethoscope,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { StudentClearanceComponentStatus, StudentClearanceSummary } from "../contracts";

const confirmedDateFormat = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

function ClearanceStatusIndicator({ status }: { status: StudentClearanceComponentStatus }) {
  if (status.cleared) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
        <Check className="size-3.5 shrink-0 stroke-[2.5]" aria-hidden="true" />
        Cleared
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground whitespace-nowrap">
      <span className="size-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
      Pending
    </span>
  );
}

export function StudentClearanceView({ summary }: { summary: StudentClearanceSummary }) {
  const { components, isEnrolled, isFullyCleared, isCurrentSemester, semesterName } = summary;

  const clearedCount = useMemo(() => {
    let count = 0;
    if (components.council.cleared) count++;
    if (components.academic.cleared) count++;
    if (components.rle.cleared) count++;
    return count;
  }, [components]);

  const pendingFaculty = useMemo(() => {
    const list: string[] = [];
    if (!components.academic.cleared) list.push("Academic");
    if (!components.rle.cleared) list.push("RLE");
    return list;
  }, [components.academic.cleared, components.rle.cleared]);

  if (!isEnrolled) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="flex flex-col items-center justify-center p-8 text-center sm:p-12">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <CalendarX className="size-6" />
          </div>
          <CardTitle className="mt-4 text-base font-medium">Not Enrolled in this Semester</CardTitle>
          <CardDescription className="mt-1.5 max-w-sm text-xs text-muted-foreground">
            You were not enrolled in <span className="font-medium text-foreground">{semesterName}</span>, so there are
            no clearance records to display for this term.
          </CardDescription>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6 overflow-x-hidden">
      {/* Hero Progress Banner */}
      {isFullyCleared ? (
        <div className="flex items-start gap-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-emerald-950 dark:text-emerald-100 shadow-xs">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-6" />
          </div>
          <div>
            <h2 className="font-heading text-base font-semibold leading-tight text-emerald-900 dark:text-emerald-200">
              Semester Clearance Complete
            </h2>
            <p className="mt-1 text-xs text-emerald-800/90 dark:text-emerald-300/90">
              All three clearances (Council, Academic, and RLE) are officially confirmed for {semesterName}.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <span className="font-heading text-sm font-semibold">{clearedCount}/3</span>
            </div>
            <div>
              <h2 className="font-heading text-base font-semibold text-foreground">
                {clearedCount} of 3 clearances confirmed
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {components.council.cleared
                  ? pendingFaculty.length === 1
                    ? `Council clearance is complete. Awaiting sign-off from your ${pendingFaculty[0]} Coordinator.`
                    : "Council clearance is complete. Awaiting sign-off from your Faculty Coordinators."
                  : "Council clearance is the prerequisite and must be completed before faculty sign-offs can proceed."}
              </p>
            </div>
          </div>
          {/* Visual Progress Meter */}
          <div className="flex h-2 w-28 shrink-0 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div
              className="h-full w-full bg-emerald-500 origin-left transition-transform duration-300 ease-out-soft"
              style={{ transform: `scaleX(${clearedCount / 3})` }}
            />
          </div>
        </div>
      )}

      {/* Archived Past Semester Notice */}
      {!isCurrentSemester && (
        <div className="flex items-center gap-3 rounded-lg border border-border/80 bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
          <History className="size-4 shrink-0 text-muted-foreground/80" />
          <span>
            <strong className="font-medium text-foreground">Historical Record:</strong> Clearance records for past
            semesters are permanent and immutable. Subsequent ledger changes do not revoke past confirmations.
          </span>
        </div>
      )}

      {/* 3 Component Cards Grid */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {/* 1. Council Clearance Card */}
        <Card className="flex flex-col justify-between border-border bg-card">
          <CardHeader className="border-b border-border/60 pb-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Building2 className="size-3.5" />
                </div>
                <CardTitle className="text-sm font-semibold">Council</CardTitle>
              </div>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                Prerequisite
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Status</span>
              <ClearanceStatusIndicator status={components.council} />
            </div>
          </CardHeader>

          <CardContent className="flex flex-col gap-3 py-4 text-xs">
            {components.council.cleared ? (
              <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/15 p-3 text-muted-foreground">
                <div className="text-foreground font-medium">Council clearance confirmed</div>
                {components.council.confirmedAt && (
                  <div className="mt-1 text-[11px]">
                    Confirmed on {confirmedDateFormat.format(new Date(components.council.confirmedAt))}
                  </div>
                )}
                {components.council.confirmedByName && (
                  <div className="mt-0.5 text-[11px]">by {components.council.confirmedByName}</div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-muted-foreground leading-relaxed">
                  Covers student council dues and financial obligations. Council clearance must be granted before
                  faculty coordinators can sign off.
                </p>
                <div className="rounded-md bg-muted/50 p-3 text-[11px] text-muted-foreground">
                  Settle all outstanding fees, dues, or fines to be eligible for Council clearance sign-off.
                </div>
              </div>
            )}
          </CardContent>

          <CardFooter className="pt-2 border-t border-border/40">
            {components.council.cleared ? (
              <div className="flex w-full items-center justify-center py-2 text-xs text-muted-foreground">
                <Check className="mr-1.5 size-3.5 text-emerald-600" />
                Requirement Fulfilled
              </div>
            ) : (
              <Link
                href="/student/fees-and-fines"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "w-full justify-between min-h-[44px] sm:min-h-8 text-xs font-medium"
                )}
              >
                <span>View Fees &amp; Fines</span>
                <ArrowRight className="size-3.5" />
              </Link>
            )}
          </CardFooter>
        </Card>

        {/* 2. Academic Clearance Card */}
        <Card className="flex flex-col justify-between border-border bg-card">
          <CardHeader className="border-b border-border/60 pb-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <GraduationCap className="size-3.5" />
                </div>
                <CardTitle className="text-sm font-semibold">Academic</CardTitle>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Status</span>
              <ClearanceStatusIndicator status={components.academic} />
            </div>
          </CardHeader>

          <CardContent className="flex flex-col gap-3 py-4 text-xs">
            {components.academic.cleared ? (
              <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/15 p-3 text-muted-foreground">
                <div className="text-foreground font-medium">Academic clearance confirmed</div>
                {components.academic.confirmedAt && (
                  <div className="mt-1 text-[11px]">
                    Confirmed on {confirmedDateFormat.format(new Date(components.academic.confirmedAt))}
                  </div>
                )}
                {components.academic.confirmedByName && (
                  <div className="mt-0.5 text-[11px]">by {components.academic.confirmedByName}</div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {!components.council.cleared ? (
                  <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-[11px] text-amber-800 dark:text-amber-300">
                    <span className="font-medium">Council Clearance Required:</span> Council sign-off is a prerequisite
                    before your Academic Coordinator can confirm classroom clearance.
                  </div>
                ) : (
                  <div className="rounded-md border border-blue-500/20 bg-blue-500/10 p-3 text-[11px] text-blue-800 dark:text-blue-300">
                    <span className="font-medium">Prerequisite Met:</span> Council clearance is confirmed. Awaiting
                    review and confirmation by the Academic Coordinator.
                  </div>
                )}
                <p className="text-muted-foreground leading-relaxed">
                  Covers classroom theory and Office bucket disciplinary records. Ensure any demerits are settled with
                  merits or service.
                </p>
              </div>
            )}
          </CardContent>

          <CardFooter className="pt-2 border-t border-border/40">
            {components.academic.cleared ? (
              <div className="flex w-full items-center justify-center py-2 text-xs text-muted-foreground">
                <Check className="mr-1.5 size-3.5 text-emerald-600" />
                Requirement Fulfilled
              </div>
            ) : (
              <Link
                href="/student/merits-demerits-and-services"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "w-full justify-between min-h-[44px] sm:min-h-8 text-xs font-medium"
                )}
              >
                <span>View Disciplinary Records</span>
                <ArrowRight className="size-3.5" />
              </Link>
            )}
          </CardFooter>
        </Card>

        {/* 3. RLE Clearance Card */}
        <Card className="flex flex-col justify-between border-border bg-card">
          <CardHeader className="border-b border-border/60 pb-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
                  <Stethoscope className="size-3.5" />
                </div>
                <CardTitle className="text-sm font-semibold">RLE</CardTitle>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Status</span>
              <ClearanceStatusIndicator status={components.rle} />
            </div>
          </CardHeader>

          <CardContent className="flex flex-col gap-3 py-4 text-xs">
            {components.rle.cleared ? (
              <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/15 p-3 text-muted-foreground">
                <div className="text-foreground font-medium">RLE clearance confirmed</div>
                {components.rle.confirmedAt && (
                  <div className="mt-1 text-[11px]">
                    Confirmed on {confirmedDateFormat.format(new Date(components.rle.confirmedAt))}
                  </div>
                )}
                {components.rle.confirmedByName && (
                  <div className="mt-0.5 text-[11px]">by {components.rle.confirmedByName}</div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {!components.council.cleared ? (
                  <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-[11px] text-amber-800 dark:text-amber-300">
                    <span className="font-medium">Council Clearance Required:</span> Council sign-off is a prerequisite
                    before your RLE Coordinator can confirm clinical clearance.
                  </div>
                ) : (
                  <div className="rounded-md border border-teal-500/20 bg-teal-500/10 p-3 text-[11px] text-teal-800 dark:text-teal-300">
                    <span className="font-medium">Prerequisite Met:</span> Council clearance is confirmed. Awaiting
                    review and confirmation by the RLE Coordinator.
                  </div>
                )}
                <p className="text-muted-foreground leading-relaxed">
                  Covers clinical hospital rotations and RLE make-up duty hours. Verify that your clinical service
                  credits are updated.
                </p>
              </div>
            )}
          </CardContent>

          <CardFooter className="pt-2 border-t border-border/40">
            {components.rle.cleared ? (
              <div className="flex w-full items-center justify-center py-2 text-xs text-muted-foreground">
                <Check className="mr-1.5 size-3.5 text-emerald-600" />
                Requirement Fulfilled
              </div>
            ) : (
              <Link
                href="/student/merits-demerits-and-services"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "w-full justify-between min-h-[44px] sm:min-h-8 text-xs font-medium"
                )}
              >
                <span>View Disciplinary Records</span>
                <ArrowRight className="size-3.5" />
              </Link>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
