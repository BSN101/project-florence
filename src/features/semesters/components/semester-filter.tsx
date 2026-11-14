"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NavigationOverlay } from "@/components/layout/navigation-overlay";
import type { SemesterOption } from "@/features/access/access-policy";

function semesterLabel(semester: SemesterOption) {
  return `${semester.academic_year_start} · ${semester.term}${semester.is_current ? " (current)" : ""}`;
}

export function SemesterFilter({ semesters, selectedId, enrollmentLimited = false }: {
  semesters: SemesterOption[];
  selectedId: string;
  enrollmentLimited?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const searchParams = useSearchParams();
  const items = semesters.map((semester) => ({
    value: semester.id,
    label: semesterLabel(semester),
  }));

  function selectSemester(value: string | null) {
    if (!value || value === selectedId || isPending) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("semester", value);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3" aria-busy={isPending}>
      <NavigationOverlay visible={isPending} label="Switching semester…" />
      <label className="font-medium" htmlFor="semester-filter">View semester</label>
      <Select items={items} value={selectedId} onValueChange={selectSemester} disabled={isPending}>
        <SelectTrigger id="semester-filter" className="w-full sm:w-auto sm:min-w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          {semesters.map((semester) => (
            <SelectItem key={semester.id} value={semester.id}>{semesterLabel(semester)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="w-full text-xs text-muted-foreground">
        This filters this page only. It does not change the institutionally current semester.
        {enrollmentLimited ? " Only semesters in which you are enrolled are available here." : ""}
      </p>
    </div>
  );
}
