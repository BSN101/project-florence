"use client";

import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";

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

/** Scrolling table frame that adapts naturally to content height up to max-height. */
export function TableFrame({
  filters,
  pager,
  children,
  className,
}: {
  filters: ReactNode;
  pager: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-3.5 min-w-0 max-w-full overflow-hidden">
      <div className="flex flex-wrap items-center gap-2.5 min-w-0 max-w-full">{filters}</div>
      <div
        className={cn(
          "max-h-[28rem] w-full max-w-full overflow-x-auto overflow-y-auto rounded-xl border border-border bg-card shadow-xs clearance-scrollbar",
          className
        )}
      >
        {children}
      </div>
      <div className="min-w-0 max-w-full">{pager}</div>
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
    <div className="flex min-h-[13rem] flex-col items-center justify-center gap-2.5 p-8 text-center">
      <Icon className="size-8 text-muted-foreground/50" />
      <p className="text-sm font-medium text-foreground">{filtered ? "No records match these filters" : title}</p>
      <p className="text-xs text-muted-foreground">{filtered ? "Change or clear the filters above." : text}</p>
    </div>
  );
}

export const THEAD_CLASS = "sticky top-0 z-10 border-b border-border bg-muted/90 backdrop-blur-xs font-medium text-muted-foreground text-xs";
