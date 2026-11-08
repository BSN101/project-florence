import Link from "next/link";
import {
  Bell,
  BookOpenCheck,
  CalendarDays,
  Check,
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

import { signOut } from "@/app/(auth)/sign-out/action";
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
  SidebarRail,
} from "@/components/ui/sidebar";
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

export function AppSidebar({ workspace, navigation, currentSlug, access }: {
  workspace: Workspace;
  navigation: NavigationItem[];
  currentSlug: string;
  access: ReadyAccess;
}) {
  const fullName = [access.profile.first_name, access.profile.middle_name, access.profile.last_name, access.profile.suffix]
    .filter(Boolean).join(" ");
  const initials = `${access.profile.first_name[0] ?? ""}${access.profile.last_name[0] ?? ""}`.toUpperCase();

  return (
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
                return (
                  <SidebarMenuItem key={item.slug}>
                    <SidebarMenuButton isActive={item.slug === currentSlug} tooltip={item.label}
                      render={<Link href={destinationHref(workspace, item.slug)} />}>
                      <Icon />
                      <span>{item.label}</span>
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
                      <DropdownMenuItem key={item} render={<Link href={`/${item}`} />}>
                        {item === workspace ? <Check /> : <span className="size-4" />}
                        {workspaceLabels[item]}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </>}
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<Link href="/reset-password" />}><KeyRound />Change password</DropdownMenuItem>
                <DropdownMenuItem render={<form action={signOut}><button type="submit" className="flex w-full items-center gap-1.5"><LogOut />Sign out</button></form>} />
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
