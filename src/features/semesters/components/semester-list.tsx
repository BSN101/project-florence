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
      <Card className="flex flex-col items-center justify-center gap-4 p-8 text-center sm:p-12">
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
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">
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
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-success px-2.5 py-0.5 text-xs font-medium text-success-foreground">
                          <span className="size-1.5 rounded-full bg-current" />
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
