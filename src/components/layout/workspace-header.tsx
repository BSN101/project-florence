import Link from "next/link";
import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { Workspace } from "@/features/access/access-policy";
import type { AccessContext } from "@/server/auth/access-context";
import { AccountSheet } from "./account-menu";
import { ScrollEdge } from "./scroll-edge";

export function WorkspaceHeader({
  title,
  workspace,
  unreadNotifications = 0,
  access,
  tabBar = false,
}: {
  title: string;
  workspace: Workspace;
  unreadNotifications?: number;
  access: Extract<AccessContext, { status: "ready" }>;
  /** The phone tab bar replaces the sidebar menu button below md. */
  tabBar?: boolean;
}) {
  return (
    // Phones: flat at the top, frosted with a hairline and a centred compact title once the page title scrolls under it.
    <header className="group/header sticky top-0 z-20 flex min-h-14 items-center justify-between border-b border-border bg-background/95 px-4 py-1.5 backdrop-blur transition-[background-color,border-color] duration-200 max-md:border-transparent max-md:bg-background max-md:data-scrolled:border-border max-md:data-scrolled:bg-background/80 max-md:data-scrolled:backdrop-blur-xl sm:px-6 md:min-h-16 md:py-3" style={{ viewTransitionName: "workspace-header" }}>
      <ScrollEdge watch="page-title" />
      <div className="flex items-center gap-3 min-w-0">
        <SidebarTrigger className={`size-11 md:size-7 ${tabBar ? "max-md:hidden" : ""}`} />
        <Separator orientation="vertical" className="h-5 max-md:hidden" />
        <p className="truncate font-heading font-semibold transition-[opacity,translate] duration-200 max-md:pointer-events-none max-md:absolute max-md:inset-x-28 max-md:translate-y-1 max-md:text-center max-md:opacity-0 max-md:group-data-scrolled/header:translate-y-0 max-md:group-data-scrolled/header:opacity-100" aria-hidden>{title}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
      {workspace === "student" && (
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href="/student/notifications" />}
          className="relative size-11 p-0 rounded-lg md:size-9 text-muted-foreground hover:text-foreground"
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
      {(workspace === "student" || workspace === "council") && <AccountSheet workspace={workspace} access={access} />}
      </div>
    </header>
  );
}
