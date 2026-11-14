"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, ChevronRight, ChevronUp, KeyRound, LogOut, UserRoundCog } from "lucide-react";

import { BottomSheet, sheetGroup, sheetIconTile, sheetRow } from "@/components/layout/bottom-sheet";
import { NavigationOverlay } from "@/components/layout/navigation-overlay";
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
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { signOut } from "@/features/auth/actions";
import type { Workspace } from "@/features/access/access-policy";
import { workspaceLabels } from "@/features/access/workspace-navigation";
import type { AccessContext } from "@/server/auth/access-context";

type ReadyAccess = Extract<AccessContext, { status: "ready" }>;
type Props = { workspace: Workspace; access: ReadyAccess };

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

function identity(access: ReadyAccess, workspace: Workspace) {
  const { first_name, middle_name, last_name, suffix } = access.profile;
  return {
    fullName: [first_name, middle_name, last_name, suffix].filter(Boolean).join(" "),
    initials: `${first_name[0] ?? ""}${last_name[0] ?? ""}`.toUpperCase(),
    role: roleLabel(access, workspace),
  };
}

function useWorkspaceSwitch(workspace: Workspace) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  function switchWorkspace(event: React.MouseEvent<HTMLAnchorElement>, next: Workspace) {
    event.preventDefault();
    if (next === workspace || isPending) return;
    startTransition(() => router.push(`/${next}`));
  }
  return { isPending, switchWorkspace };
}

/** Desktop account menu in the sidebar footer. */
export function AccountMenu({ workspace, access }: Props) {
  const { fullName, initials, role } = identity(access, workspace);
  const { isPending, switchWorkspace } = useWorkspaceSwitch(workspace);

  return (
    <>
      <NavigationOverlay visible={isPending} label="Switching workspace…" />
      <DropdownMenu>
        <DropdownMenuTrigger render={<SidebarMenuButton size="lg" tooltip={fullName} />}>
          <Avatar className="size-8 rounded-lg">
            <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left leading-tight">
            <span className="truncate font-medium">{fullName}</span>
            <span className="truncate text-xs">{role}</span>
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
                  <span className="text-xs text-muted-foreground">{role}</span>
                </div>
              </div>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          {access.workspaces.length > 1 && <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
              {access.workspaces.map((item) => (
                <DropdownMenuItem key={item} render={<Link href={`/${item}`} onClick={(event) => switchWorkspace(event, item)} aria-disabled={item === workspace || isPending} />}>
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
    </>
  );
}

/** Phone account menu: an avatar in the header that opens a bottom sheet. */
export function AccountSheet({ workspace, access }: Props) {
  const { fullName, initials, role } = identity(access, workspace);
  const { isPending, switchWorkspace } = useWorkspaceSwitch(workspace);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <NavigationOverlay visible={isPending} label="Switching workspace…" />
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        trigger={<Avatar className="size-8"><AvatarFallback className="text-xs">{initials}</AvatarFallback></Avatar>}
        triggerLabel="Account menu"
        triggerClassName="flex size-11 items-center justify-center rounded-full [-webkit-tap-highlight-color:transparent] active:opacity-70 md:hidden"
        icon={<Avatar className="size-12"><AvatarFallback>{initials}</AvatarFallback></Avatar>}
        title={fullName}
        description={role}
      >
        {access.workspaces.length > 1 && (
          <section aria-label="Workspaces" className="flex flex-col gap-1.5">
            <p className="px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Workspaces</p>
            <ul className={sheetGroup}>
              {access.workspaces.map((item) => (
                <li key={item}>
                  <Link href={`/${item}`} className={sheetRow} aria-current={item === workspace ? "page" : undefined}
                    onClick={(event) => { switchWorkspace(event, item); close(); }}>
                    <span className="flex-1">{workspaceLabels[item]}</span>
                    {item === workspace && <Check className="size-5 text-primary" />}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <ul className={sheetGroup}>
          <li>
            <Link href="/account" className={sheetRow} onClick={close}>
              <span className={sheetIconTile}><UserRoundCog /></span>
              <span className="flex-1">Account</span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          </li>
          <li>
            <Link href="/account#password" className={sheetRow} onClick={close}>
              <span className={sheetIconTile}><KeyRound /></span>
              <span className="flex-1">Change password</span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          </li>
        </ul>

        <form action={signOut} className={sheetGroup}>
          <button type="submit" className={`${sheetRow} justify-center font-medium text-destructive`}>
            <LogOut className="size-4" />Sign out
          </button>
        </form>
      </BottomSheet>
    </>
  );
}
