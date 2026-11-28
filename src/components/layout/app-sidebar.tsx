"use client";

import Link from "next/link";
import { Suspense, useLayoutEffect, useState } from "react";
import { ChevronRight, Landmark, Users } from "lucide-react";

import { AccountMenu } from "@/components/layout/account-menu";
import { LinkPendingIndicator } from "@/components/layout/link-pending-indicator";
import { navigationIcon } from "@/components/layout/navigation-icons";
import { NotificationCount } from "@/components/layout/notification-count";
import { useActiveDestination } from "@/components/layout/use-active-destination";
import type { AccessContext } from "@/server/auth/access-context";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Collapsible } from "@base-ui/react/collapsible";
import type { Workspace } from "@/features/access/access-policy";
import type { NavigationItem } from "@/features/access/workspace-navigation";
import { destinationHref, workspaceLabels } from "@/features/access/workspace-navigation";

type ReadyAccess = Extract<AccessContext, { status: "ready" }>;

// The selection pill (below) draws the active background, so items only change icon colour and weight.
const item = "h-9 data-active:bg-transparent data-active:hover:bg-transparent hover:bg-sidebar-accent/60 [&>svg]:text-muted-foreground data-active:[&>svg]:text-primary";
const subItem = "data-active:bg-transparent data-active:hover:bg-transparent data-active:font-medium hover:bg-sidebar-accent/60";

/** Groups items by `section`, keeping list order. Items without one share an unlabelled group. */
function sections(navigation: NavigationItem[]) {
  const result: { label?: string; items: NavigationItem[] }[] = [];
  for (const entry of navigation) {
    const last = result.at(-1);
    if (last && last.label === entry.section) last.items.push(entry);
    else result.push({ label: entry.section, items: [entry] });
  }
  return result;
}

/**
 * One pill behind the selected item that glides to the next selection (DESIGN.md §7). Measured from
 * the DOM so it follows collapsible groups and the icon rail; a CSS transition retargets cleanly when
 * people click quickly.
 */
function useSelectionPill(activeSlug: string) {
  // A callback ref, not useRef: on phones the drawer mounts this container only when it opens.
  const [container, root] = useState<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    if (!container) return;
    function measure() {
      // The last visible match wins: an open group's sub-item over its group trigger.
      const target = [...container!.querySelectorAll<HTMLElement>("[data-nav-selected]")].findLast((el) => el.offsetHeight > 0);
      if (!target) return setBox(null);
      const a = target.getBoundingClientRect();
      const c = container!.getBoundingClientRect();
      setBox({ top: a.top - c.top + container!.scrollTop, left: a.left - c.left, width: a.width, height: a.height });
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    container.querySelectorAll("[data-sidebar=menu], [data-sidebar=menu-sub]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [container, activeSlug]);

  const pill = box && (
    <div aria-hidden className="pointer-events-none absolute top-0 left-0 rounded-lg bg-background shadow-xs ring-1 ring-sidebar-border/60 transition-[translate,width,height] duration-300 ease-glide"
      style={{ translate: `${box.left}px ${box.top}px`, width: box.width, height: box.height }} />
  );
  return { root, pill };
}

export function AppSidebar({ workspace, navigation, access, unreadNotifications }: {
  workspace: Workspace;
  navigation: NavigationItem[];
  access: ReadyAccess;
  /** Students only; streamed so the sidebar does not wait for the count. */
  unreadNotifications?: Promise<number>;
}) {
  // Rendered once by the workspace layout, so the current item comes from the URL, not a page prop.
  const { activeSlug, tap } = useActiveDestination(workspace);
  const { root, pill } = useSelectionPill(activeSlug);

  function link(slug: string) {
    return <Link href={destinationHref(workspace, slug)} aria-current={slug === activeSlug ? "page" : undefined}
      onClick={(event) => tap(event, slug)} />;
  }

  return (
    <Sidebar variant="inset" collapsible="icon" data-print-chrome className="pl-[env(safe-area-inset-left)]">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="Project Florence" render={<Link href={`/${workspace}`} />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Landmark className="size-4" />
              </div>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-heading font-semibold">Project Florence</span>
                <span className="truncate text-xs text-muted-foreground">{workspaceLabels[workspace]}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent ref={root} className="relative">
        {pill}
        {sections(navigation).map((section) => (
          <SidebarGroup key={section.label ?? "main"}>
            {section.label && <SidebarGroupLabel>{section.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {section.items.map((entry, index) => {
                  if (entry.group) {
                    // Render each group once, at its first item, with all its items as a sub-menu.
                    if (section.items.findIndex((other) => other.group === entry.group) !== index) return null;
                    const children = section.items.filter((other) => other.group === entry.group);
                    const active = children.some((child) => child.slug === activeSlug);
                    return (
                      <Collapsible.Root key={entry.group} defaultOpen render={<SidebarMenuItem />}>
                        <Collapsible.Trigger render={<SidebarMenuButton isActive={active} tooltip={entry.group} className={item}
                          data-nav-selected={active || undefined} />}>
                          <Users />
                          <span>{entry.group}</span>
                          <ChevronRight className="ml-auto transition-transform duration-200 ease-out-soft in-data-[panel-open]:rotate-90" />
                        </Collapsible.Trigger>
                        <Collapsible.Panel>
                          <SidebarMenuSub>
                            {children.map((child) => (
                              <SidebarMenuSubItem key={child.slug}>
                                <SidebarMenuSubButton isActive={child.slug === activeSlug} className={subItem}
                                  data-nav-selected={child.slug === activeSlug || undefined} render={link(child.slug)}>
                                  <span>{child.label}</span>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </Collapsible.Panel>
                      </Collapsible.Root>
                    );
                  }
                  const Icon = navigationIcon(workspace, entry.slug);
                  const active = entry.slug === activeSlug;
                  return (
                    <SidebarMenuItem key={entry.slug}>
                      <SidebarMenuButton isActive={active} tooltip={entry.label} className={item}
                        data-nav-selected={active || undefined} render={link(entry.slug)}>
                        <Icon />
                        <span>{entry.label}</span>
                        {entry.slug === "notifications" && unreadNotifications && (
                          <Suspense><NotificationCount count={unreadNotifications} variant="sidebar" /></Suspense>
                        )}
                        <LinkPendingIndicator />
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <AccountMenu workspace={workspace} access={access} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
