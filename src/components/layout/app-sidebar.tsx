"use client";

import Link from "next/link";
import {
  Bell,
  BookOpenCheck,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  FileChartColumn,
  GraduationCap,
  HandCoins,
  Landmark,
  Medal,
  QrCode,
  Scale,
  School,
  Settings,
  ShieldCheck,
  UserRoundCog,
  Users,
} from "lucide-react";

import { AccountMenu } from "@/components/layout/account-menu";
import { LinkPendingIndicator } from "@/components/layout/navigation-overlay";
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

const icons = [QrCode, CalendarDays, CircleDollarSign, Medal, ClipboardCheck, Bell, Users, HandCoins,
  Scale, FileChartColumn, School, ShieldCheck, Landmark, GraduationCap, BookOpenCheck, UserRoundCog, Settings];

type ReadyAccess = Extract<AccessContext, { status: "ready" }>;

export function AppSidebar({ workspace, navigation, currentSlug, access, unreadNotifications = 0 }: {
  workspace: Workspace;
  navigation: NavigationItem[];
  currentSlug: string;
  access: ReadyAccess;
  unreadNotifications?: number;
}) {
  return (
    <Sidebar collapsible="icon" className="pl-[env(safe-area-inset-left)]">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="Project Florence" render={<Link href={`/${workspace}`} />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Landmark className="size-4" />
              </div>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-heading font-semibold">Project Florence</span>
                <span className="truncate text-xs">{workspaceLabels[workspace]}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item, index) => {
                const Icon = icons[index % icons.length];
                if (item.group) {
                  // Render each group once, at its first item, with all its items as a sub-menu.
                  if (navigation.findIndex((other) => other.group === item.group) !== index) return null;
                  const children = navigation.filter((other) => other.group === item.group);
                  const active = children.some((child) => child.slug === currentSlug);
                  return (
                    <Collapsible.Root key={item.group} defaultOpen render={<SidebarMenuItem />}>
                      <Collapsible.Trigger render={<SidebarMenuButton isActive={active} tooltip={item.group} />}>
                        <Users />
                        <span>{item.group}</span>
                        <ChevronRight className="ml-auto transition-transform in-data-[panel-open]:rotate-90" />
                      </Collapsible.Trigger>
                      <Collapsible.Panel>
                        <SidebarMenuSub>
                          {children.map((child) => (
                            <SidebarMenuSubItem key={child.slug}>
                              <SidebarMenuSubButton isActive={child.slug === currentSlug}
                                render={<Link href={destinationHref(workspace, child.slug)} />}>
                                <span>{child.label}</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </Collapsible.Panel>
                    </Collapsible.Root>
                  );
                }
                return (
                  <SidebarMenuItem key={item.slug}>
                    <SidebarMenuButton isActive={item.slug === currentSlug} tooltip={item.label}
                      render={<Link href={destinationHref(workspace, item.slug)} />}>
                      <Icon />
                      <span>{item.label}</span>
                      {workspace === "student" && item.slug === "notifications" && unreadNotifications > 0 && (
                        <span className="ml-auto flex min-w-5 h-5 items-center justify-center rounded-full bg-primary/15 text-primary px-1.5 text-[10px] font-bold">
                          {unreadNotifications > 99 ? "99+" : unreadNotifications}
                        </span>
                      )}
                      <LinkPendingIndicator />
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
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
