import { CalendarDays } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { SemesterListItem } from "../contracts";
import { ActivateSemesterDialog } from "./activate-semester-dialog";
import { CreateSemesterDialog } from "./create-semester-dialog";

function formatDate(isoDate: string): string {
  try {
    const [year, month, day] = isoDate.split("-").map(Number);
    if (!year || !month || !day) return isoDate;
    const date = new Date(Date.UTC(year, month - 1, day));
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
  } catch {
    return isoDate;
  }
}

export function SemesterList({
  semesters,
  canManage,
}: {
  semesters: SemesterListItem[];
  canManage: boolean;
}) {
  const currentSemester = semesters.find((s) => s.is_current) ?? null;

  if (semesters.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center gap-4 p-6 text-center sm:p-12">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <CalendarDays className="size-6 text-muted-foreground" />
        </div>
        <div className="flex max-w-sm flex-col gap-1.5">
          <h2 className="font-heading text-lg font-medium text-foreground">No semesters configured</h2>
          <p className="text-sm text-muted-foreground">
            No semester records have been created yet. Create a semester to establish an academic context for records and enrollments.
          </p>
        </div>
        {canManage && <CreateSemesterDialog />}
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Mobile & Tablet Card View (< lg: 1 col on mobile, 2 cols on tablet / iPad) */}
      <div className="pr-1 pb-1 md:max-h-[600px] md:overflow-y-auto lg:hidden">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {semesters.map((semester) => {
            const ayLabel = `AY ${semester.academic_year_start}–${semester.academic_year_start + 1}`;
            const dateRange = `${formatDate(semester.starts_on)} – ${formatDate(semester.ends_on)}`;

            return (
              <div
                key={semester.id}
                className={`flex flex-col justify-between gap-3.5 rounded-xl border p-4 transition-colors ${
                  semester.is_current
                    ? "border-primary/50 bg-card shadow-xs"
                    : "border-border bg-card/60"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-heading text-sm font-semibold text-foreground">
                    {ayLabel}
                  </span>
                  {semester.is_current ? (
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-600/30 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                      <span className="size-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                      <span className="size-1.5 rounded-full bg-current" />
                      Inactive
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-base font-semibold text-foreground">
                    {semester.term}
                  </span>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarDays className="size-3.5 shrink-0" />
                    <span>{dateRange}</span>
                  </div>
                </div>

                <div className="border-t border-border/60 pt-3">
                  {semester.is_current ? (
                    <span className="inline-block text-xs font-medium text-muted-foreground">
                      Current Active Context
                    </span>
                  ) : canManage ? (
                    <ActivateSemesterDialog
                      semester={semester}
                      currentSemester={currentSemester}
                      fullWidth
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Desktop Table View (>= lg) */}
      <div className="hidden overflow-hidden rounded-xl border border-border bg-card lg:block shadow-xs">
        <div className="max-h-[600px] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-muted/95 backdrop-blur-xs text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-5 py-3.5">Academic Year</th>
                <th className="px-5 py-3.5">Term</th>
                <th className="px-5 py-3.5">Date Range</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {semesters.map((semester) => {
                const ayLabel = `AY ${semester.academic_year_start}–${semester.academic_year_start + 1}`;
                const dateRange = `${formatDate(semester.starts_on)} – ${formatDate(semester.ends_on)}`;

                return (
                  <tr key={semester.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-5 py-4 font-medium text-foreground">
                      {ayLabel}
                    </td>
                    <td className="px-5 py-4 text-foreground">
                      {semester.term}
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">
                      {dateRange}
                    </td>
                    <td className="px-5 py-4">
                      {semester.is_current ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/30 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                          <span className="size-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                          <span className="size-1.5 rounded-full bg-current" />
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {semester.is_current ? (
                        <span className="text-xs font-medium text-muted-foreground">
                          Current Context
                        </span>
                      ) : canManage ? (
                        <ActivateSemesterDialog
                          semester={semester}
                          currentSemester={currentSemester}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
