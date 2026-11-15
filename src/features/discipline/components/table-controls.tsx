"use client";

import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";

const PAGE_SIZE = 25;

/** Pages `rows` 25 at a time; returns to the first page whenever `filterKey` changes. */
export function usePagedRows<T>(rows: T[], filterKey: string) {
  const [state, setState] = useState({ key: filterKey, page: 0 });
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = state.key === filterKey ? Math.min(state.page, pageCount - 1) : 0;
  const first = page * PAGE_SIZE;
  const pageRows = rows.slice(first, first + PAGE_SIZE);
  const setPage = (next: number) => setState({ key: filterKey, page: next });

  // Always rendered, even for one page, so the layout height never changes.
  const pager = (
    <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
      <span>
        {rows.length === 0 ? (
          "Showing 0 records"
        ) : (
          <>
            Showing <strong>{first + 1}–{first + pageRows.length}</strong> of {rows.length}
          </>
        )}
      </span>
      <nav aria-label="Table pages" className="flex items-center gap-2">
        <Button variant="outline" size="sm" aria-label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <span aria-live="polite">
          Page {page + 1} of {pageCount}
        </span>
        <Button
          variant="outline"
          size="sm"
          aria-label="Next page"
          disabled={page === pageCount - 1}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight className="size-4" />
        </Button>
      </nav>
    </div>
  );

  return { pageRows, pager };
}

export type FilterOption = { value: string; label: string };

export const BUCKET_OPTIONS: FilterOption[] = [
  { value: "all", label: "All" },
  { value: "office", label: "Office" },
  { value: "rle", label: "RLE" },
];

/** True when `value` is "all" or equals the row's field. */
export const matches = (filter: string, value: string) => filter === "all" || filter === value;

export function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}) {
  const current = options.find((option) => option.value === value)?.label ?? options[0].label;
  return (
    <Select value={value} onValueChange={(next) => onChange(next ?? "all")}>
      <SelectTrigger className="w-full text-xs sm:w-[150px]" aria-label={label}>
        <span className="truncate">
          {label}: {current}
        </span>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Fixed-height, scrolling frame so switching tabs or filters never resizes the page. */
export function TableFrame({ filters, pager, children }: { filters: ReactNode; pager: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">{filters}</div>
      <div className="h-[26rem] overflow-auto rounded-xl border border-border bg-card">{children}</div>
      {pager}
    </div>
  );
}

export function TableEmpty({
  icon: Icon,
  title,
  text,
  filtered,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  filtered: boolean;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <Icon className="size-8 text-muted-foreground/60" />
      <p className="text-sm font-medium text-foreground">{filtered ? "No records match these filters" : title}</p>
      <p className="text-xs text-muted-foreground">{filtered ? "Change or clear the filters above." : text}</p>
    </div>
  );
}

export const THEAD_CLASS = "sticky top-0 z-10 border-b border-border bg-muted font-medium text-muted-foreground";
