"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { Bell, Landmark } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { Workspace } from "@/features/access/access-policy";
import { workspaceLabels, type NavigationItem } from "@/features/access/workspace-navigation";
import type { AccessContext } from "@/server/auth/access-context";
import { AccountMenu, AccountSheet } from "./account-menu";
import { NotificationCount } from "./notification-count";

export function WorkspaceHeader({
  navigation,
  workspace,
  unreadNotifications,
  access,
  tabBar = false,
  focused = false,
}: {
  navigation: NavigationItem[];
  workspace: Workspace;
  /** Students only; streamed so the header does not wait for the count. */
  unreadNotifications?: Promise<number>;
  access: Extract<AccessContext, { status: "ready" }>;
  /** The phone tab bar replaces the sidebar menu button below md. */
  tabBar?: boolean;
  /** One destination: no sidebar, so the header carries the brand and the account menu at every width. */
  focused?: boolean;
}) {
  const slug = usePathname().replace(new RegExp(`^/${workspace}/?`), "");
  // Off-menu routes (not-found pages) fall back to the workspace name.
  const title = navigation.find((item) => item.slug === slug)?.label ?? workspaceLabels[workspace];
  return (
    // Phones: flat at the top, frosted with a hairline and a centred compact title once the page title scrolls under it.
    <header className="group/header sticky top-0 z-20 md:top-2 md:rounded-t-xl flex min-h-14 items-center justify-between border-b border-border bg-background/95 px-4 py-1.5 backdrop-blur transition-[background-color,border-color] duration-200 max-md:border-transparent max-md:bg-background max-md:data-scrolled:border-border max-md:data-scrolled:bg-background/80 max-md:data-scrolled:backdrop-blur-xl sm:px-6 md:min-h-16 md:py-3" style={{ viewTransitionName: "workspace-header" }} data-scroll-edge>
      <div className="flex items-center gap-3 min-w-0">
        {focused ? (
          <Link href={`/${workspace}`} className="flex items-center gap-2.5 rounded-lg" aria-label="Project Florence">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Landmark className="size-4" /></span>
            <span className="grid leading-tight max-md:hidden">
              <span className="font-heading font-semibold">Project Florence</span>
              <span className="text-xs text-muted-foreground">{workspaceLabels[workspace]}{access.councilRole === "representative" && " · Representative"}</span>
            </span>
          </Link>
        ) : <>
          <SidebarTrigger className={`size-11 md:size-7 ${tabBar ? "max-md:hidden" : ""}`} />
          <Separator orientation="vertical" className="h-5 max-md:hidden" />
        </>}
        <p className={`truncate font-heading font-semibold ${focused ? "md:hidden" : ""} transition-[opacity,translate] duration-200 max-md:pointer-events-none max-md:absolute max-md:inset-x-28 max-md:translate-y-1 max-md:text-center max-md:opacity-0 max-md:group-data-scrolled/header:translate-y-0 max-md:group-data-scrolled/header:opacity-100`} aria-hidden>{title}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
      {workspace === "student" && (
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href="/student/notifications" />}
          className="relative size-11 p-0 rounded-lg md:size-9 text-muted-foreground hover:text-foreground"
          title="Notifications"
          aria-label="Notifications"
        >
          <Bell className="size-4.5" />
          {unreadNotifications && <Suspense><NotificationCount count={unreadNotifications} variant="header" /></Suspense>}
        </Button>
      )}
      {(workspace === "student" || workspace === "council") && <AccountSheet workspace={workspace} access={access} />}
      {focused && <div className="max-md:hidden"><AccountMenu workspace={workspace} access={access} compact /></div>}
      </div>
    </header>
  );
}
