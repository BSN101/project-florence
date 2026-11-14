"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  Bell,
  BookOpenCheck,
  CalendarDays,
  Check,
  ChevronRight,
  ChevronUp,
  CircleDollarSign,
  ClipboardCheck,
  FileChartColumn,
  GraduationCap,
  HandCoins,
  KeyRound,
  Landmark,
  LogOut,
  Medal,
  QrCode,
  Scale,
  School,
  Settings,
  ShieldCheck,
  UserRoundCog,
  Users,
} from "lucide-react";

import { LinkPendingIndicator, NavigationOverlay } from "@/components/layout/navigation-overlay";
import { signOut } from "@/features/auth/actions";
import type { AccessContext } from "@/server/auth/access-context";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

function roleLabel(access: ReadyAccess, workspace: Workspace) {
  if (workspace === "student") return "Student";
  if (workspace === "council" && access.councilRole) {
    return `Council ${access.councilRole[0].toUpperCase()}${access.councilRole.slice(1)}`;
  }
  if (workspace === "admin") return "Platform Admin";
  if (access.roles.includes("RLE Coordinator")) return "RLE Coordinator";
  if (access.roles.includes("Academic Coordinator")) return "Academic Coordinator";
  return access.roles[0] ?? "Faculty";
}

export function AppSidebar({ workspace, navigation, currentSlug, access, unreadNotifications = 0 }: {
  workspace: Workspace;
  navigation: NavigationItem[];
  currentSlug: string;
  access: ReadyAccess;
  unreadNotifications?: number;
}) {
  const router = useRouter();
  const [isWorkspacePending, startWorkspaceTransition] = useTransition();
  const fullName = [access.profile.first_name, access.profile.middle_name, access.profile.last_name, access.profile.suffix]
    .filter(Boolean).join(" ");
  const initials = `${access.profile.first_name[0] ?? ""}${access.profile.last_name[0] ?? ""}`.toUpperCase();

  function switchWorkspace(event: React.MouseEvent<HTMLAnchorElement>, nextWorkspace: Workspace) {
    if (nextWorkspace === workspace || isWorkspacePending) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    startWorkspaceTransition(() => router.push(`/${nextWorkspace}`));
  }

  return (
    <>
      <NavigationOverlay visible={isWorkspacePending} label="Switching workspace…" />
    <Sidebar collapsible="icon">
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
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuButton size="lg" tooltip={fullName} />}>
                <Avatar className="size-8 rounded-lg">
                  <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-medium">{fullName}</span>
                  <span className="truncate text-xs">{roleLabel(access, workspace)}</span>
                </div>
                <ChevronUp className="ml-auto" />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="min-w-64">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="p-2 font-normal">
                    <div className="flex items-center gap-2">
                      <Avatar className="size-9 rounded-lg"><AvatarFallback className="rounded-lg">{initials}</AvatarFallback></Avatar>
                      <div className="grid leading-tight">
                        <span className="font-medium">{fullName}</span>
                        <span className="text-xs text-muted-foreground">{roleLabel(access, workspace)}</span>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                {access.workspaces.length > 1 && <>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
                    {access.workspaces.map((item) => (
                      <DropdownMenuItem key={item} render={<Link href={`/${item}`} onClick={(event) => switchWorkspace(event, item)} aria-disabled={item === workspace || isWorkspacePending} />}>
                        {item === workspace ? <Check /> : <span className="size-4" />}
                        {workspaceLabels[item]}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </>}
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<Link href="/account" />}><UserRoundCog />Account</DropdownMenuItem>
                <DropdownMenuItem render={<Link href="/account#password" />}><KeyRound />Change password</DropdownMenuItem>
                <DropdownMenuItem render={<form action={signOut}><button type="submit" className="flex w-full items-center gap-1.5"><LogOut />Sign out</button></form>} />
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
    </>
  );
}
