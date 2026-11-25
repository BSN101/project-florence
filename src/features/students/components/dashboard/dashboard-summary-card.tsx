import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { buildSemesterHref } from "@/features/students/dashboard";

export { buildSemesterHref };

export function DashboardSummaryCard({
  title,
  icon,
  iconClassName,
  badge,
  href,
  footerLabel,
  error,
  empty,
  emptyMessage,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  iconClassName: string;
  badge?: React.ReactNode;
  href: string;
  footerLabel: string;
  error?: string | null;
  empty?: boolean;
  emptyMessage?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className="group relative flex flex-col justify-between rounded-2xl border border-border bg-card p-4 sm:p-6 transition-colors hover:border-primary/40 hover:bg-muted/5 shadow-2xs">
      <Link
        href={href}
        className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
        aria-label={`${title} - ${footerLabel}`}
      />
      <div className="flex flex-col gap-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2.5 sm:items-center">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div
              className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${iconClassName}`}
            >
              {icon}
            </div>
            <h3 className="font-heading text-sm font-semibold text-foreground leading-snug break-words">
              {title}
            </h3>
          </div>
          {badge && <div className="shrink-0 pt-0.5 sm:pt-0">{badge}</div>}
        </div>

        {/* Metric content */}
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : empty ? (
          <p className="text-xs text-muted-foreground">{emptyMessage}</p>
        ) : (
          children
        )}
      </div>

      {/* Footer link row */}
      <div className="mt-4 flex min-h-[44px] items-center justify-between rounded-xl bg-muted/30 px-3.5 py-2.5 text-xs font-medium text-foreground transition-colors group-hover:bg-muted/60">
        <span>{footerLabel}</span>
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
    </Card>
  );
}
