"use client";

import { useMemo, useState } from "react";
import { BellOff, CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { NotificationDTO } from "../contracts";
import { MarkAllReadButton } from "./mark-all-read-button";
import { NotificationCard } from "./notification-card";

export function NotificationList({
  initialNotifications,
  initialUnreadCount,
}: {
  initialNotifications: NotificationDTO[];
  initialUnreadCount: number;
}) {
  const [notifications, setNotifications] = useState<NotificationDTO[]>(initialNotifications);
  const [unreadCount, setUnreadCount] = useState<number>(initialUnreadCount);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const filteredNotifications = useMemo(() => {
    if (filter === "unread") {
      return notifications.filter((n) => n.read_at === null);
    }
    return notifications;
  }, [notifications, filter]);

  const handleMarkAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n)),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const handleMarkAllRead = () => {
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => (n.read_at === null ? { ...n, read_at: now } : n)),
    );
    setUnreadCount(0);
  };

  return (
    <div className="flex flex-col gap-6 w-full min-w-0">
      {/* Action Bar: Filter Tabs & Mark All Read */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-1 border-b border-border/60">
        <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 p-1 text-xs w-fit">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-1.5 font-medium transition-colors cursor-pointer",
              filter === "all"
                ? "bg-background text-foreground shadow-2xs font-semibold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span>All</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.2 text-[10px] font-semibold",
                filter === "all" ? "bg-muted text-foreground" : "bg-muted/60 text-muted-foreground",
              )}
            >
              {notifications.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilter("unread")}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-1.5 font-medium transition-colors cursor-pointer",
              filter === "unread"
                ? "bg-background text-foreground shadow-2xs font-semibold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span>Unread</span>
            {unreadCount > 0 ? (
              <span className="rounded-full bg-primary/15 text-primary px-1.5 py-0.2 text-[10px] font-bold">
                {unreadCount}
              </span>
            ) : (
              <span className="rounded-full bg-muted/60 text-muted-foreground px-1.5 py-0.2 text-[10px]">
                0
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
          <span className="text-xs text-muted-foreground">
            Showing {filteredNotifications.length} of {notifications.length}
          </span>
          <MarkAllReadButton unreadCount={unreadCount} onMarkAllRead={handleMarkAllRead} />
        </div>
      </div>

      {/* Notifications List or Empty State */}
      {filteredNotifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3.5 rounded-xl border border-dashed border-border/80 bg-muted/15 py-16 px-4 text-center">
          {filter === "unread" ? (
            <>
              <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-8" />
              </div>
              <div className="space-y-1">
                <h3 className="font-heading text-lg font-semibold text-foreground">
                  You&rsquo;re all caught up!
                </h3>
                <p className="max-w-sm text-xs text-muted-foreground leading-relaxed">
                  You have no unread notifications right now. Any new updates about fees, demerits, or service credits will appear here.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFilter("all")}
                className="mt-2 text-xs font-medium text-primary hover:underline cursor-pointer"
              >
                View all past notifications
              </button>
            </>
          ) : (
            <>
              <div className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <BellOff className="size-7" />
              </div>
              <div className="space-y-1">
                <h3 className="font-heading text-lg font-semibold text-foreground">
                  No notifications yet
                </h3>
                <p className="max-w-sm text-xs text-muted-foreground leading-relaxed">
                  When you receive endorsements, attendance demerits, or payment confirmations, you will receive notifications here.
                </p>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredNotifications.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              onMarkAsRead={handleMarkAsRead}
            />
          ))}
        </div>
      )}
    </div>
  );
}
