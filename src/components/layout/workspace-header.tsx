import Link from "next/link";
import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function WorkspaceHeader({
  title,
  workspace,
  unreadNotifications = 0,
}: {
  title: string;
  workspace?: string;
  unreadNotifications?: number;
}) {
  return (
    <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
      <div className="flex items-center gap-3 min-w-0">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-5" />
        <p className="truncate font-heading font-semibold">{title}</p>
      </div>

      {workspace === "student" && (
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href="/student/notifications" />}
          className="relative size-9 p-0 rounded-lg text-muted-foreground hover:text-foreground"
          title={
            unreadNotifications > 0
              ? `${unreadNotifications} unread notification${unreadNotifications === 1 ? "" : "s"}`
              : "Notifications"
          }
          aria-label="Notifications"
        >
          <Bell className="size-4.5" />
          {unreadNotifications > 0 && (
            <span className="absolute -top-1 -right-1 flex min-w-4 h-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground shadow-xs animate-in fade-in zoom-in">
              {unreadNotifications > 99 ? "99+" : unreadNotifications}
            </span>
          )}
        </Button>
      )}
    </header>
  );
}
