"use client";

import { useTransition } from "react";
import { CheckCheck, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

export function MarkAllReadButton({
  unreadCount,
  onMarkAllRead,
}: {
  unreadCount: number;
  onMarkAllRead: () => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();

  const handleMarkAll = () => {
    if (unreadCount === 0 || isPending) return;
    startTransition(onMarkAllRead);
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleMarkAll}
      disabled={unreadCount === 0 || isPending}
      className="gap-2 font-medium h-9 text-xs sm:text-sm shrink-0"
      title={unreadCount === 0 ? "No unread notifications" : "Mark all notifications as read"}
    >
      {isPending ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : (
        <CheckCheck className="size-4 text-primary" />
      )}
      <span>Mark all as read</span>
    </Button>
  );
}
