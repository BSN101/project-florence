"use client";

import Link from "next/link";
import { useTransition } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getNotificationMeta, type NotificationDTO } from "../contracts";

export function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    timeZone: "Asia/Manila",
  }).format(date);
}

export function formatFullDateTime(isoString: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(isoString));
}

export function NotificationCard({
  notification,
  onMarkAsRead,
}: {
  notification: NotificationDTO;
  onMarkAsRead: (id: string) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();
  const meta = getNotificationMeta(notification.kind);
  const Icon = meta.icon;
  const isUnread = notification.read_at === null;

  const handleMarkAsRead = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isUnread || isPending) return;
    startTransition(() => onMarkAsRead(notification.id));
  };

  const handleLinkClick = () => {
    if (isUnread) startTransition(() => onMarkAsRead(notification.id));
  };

  return (
    <article
      className={cn(
        "group relative flex flex-col gap-3.5 rounded-xl border p-4 sm:p-5 transition-all",
        isUnread
          ? "border-primary/25 bg-card shadow-2xs hover:border-primary/40 dark:bg-card/90"
          : "border-border/70 bg-card/40 opacity-85 hover:opacity-100 hover:border-border",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Category icon and title */}
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors",
              meta.badgeClass,
            )}
          >
            <Icon className="size-4.5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                  meta.badgeClass,
                )}
              >
                {meta.label}
              </span>

              {isUnread && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                  <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                  New
                </span>
              )}
            </div>

            <p className="mt-1.5 text-sm font-medium text-foreground leading-relaxed break-words">
              {notification.message}
            </p>
          </div>
        </div>

        {/* Timestamp & Unread Indicator */}
        <div className="flex flex-col items-end shrink-0 gap-1 text-right">
          <time
            dateTime={notification.created_at}
            // Relative time can differ by a minute between server render and hydration.
            suppressHydrationWarning
            title={formatFullDateTime(notification.created_at)}
            className="text-[11px] font-medium text-muted-foreground whitespace-nowrap"
          >
            {formatRelativeTime(notification.created_at)}
          </time>
        </div>
      </div>

      {/* Footer controls: deep link destination & mark as read */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50 text-xs">
        <Button
          variant="link"
          size="sm"
          nativeButton={false}
          render={<Link href={meta.href} onClick={handleLinkClick} />}
          className="h-auto p-0 font-medium text-primary hover:text-primary/80 gap-1 text-xs"
        >
          <span>View related records</span>
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </Button>

        {isUnread && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleMarkAsRead}
            disabled={isPending}
            className="h-7 text-xs text-muted-foreground hover:text-foreground px-2 gap-1"
          >
            {isPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Check className="size-3" />
            )}
            <span>Mark as read</span>
          </Button>
        )}
      </div>
    </article>
  );
}
