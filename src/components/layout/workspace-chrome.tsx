import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { Workspace } from "@/features/access/access-policy";
import { getWorkspaceNavigation, hasMobileTabBar, isFocusedWorkspace } from "@/features/access/workspace-navigation";
import { getUnreadNotificationCount } from "@/features/notifications/queries";
import { getAccessContext } from "@/server/auth/access-context";
import { AppSidebar } from "./app-sidebar";
import { MobileTabBar } from "./mobile-tab-bar";
import { WorkspaceHeader } from "./workspace-header";

/**
 * Sidebar, header and phone tab bar, rendered once by each workspace layout so they stay mounted
 * between pages. This only shows links: each page's WorkspaceShell still redirects or 404s, so
 * without access the chrome steps aside and lets the page decide.
 */
export async function WorkspaceChrome({ workspace, children }: { workspace: Workspace; children: React.ReactNode }) {
  const access = await getAccessContext();
  if (access.status !== "ready" || !access.workspaces.includes(workspace)) return children;

  const navigation = getWorkspaceNavigation(workspace, access);
  const tabBar = hasMobileTabBar(navigation);
  const focused = isFocusedWorkspace(navigation);
  // Not awaited: the badge streams in. Notification actions refresh it with revalidatePath("/student", "layout").
  const unreadNotifications = workspace === "student" ? getUnreadNotificationCount().catch(() => 0) : undefined;

  return (
    <SidebarProvider>
      {!focused && <AppSidebar workspace={workspace} navigation={navigation} access={access} unreadNotifications={unreadNotifications} />}
      {/* Inset panel (md+): covers the 8px gap above the sticky header so content never shows through it. */}
      {!focused && <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-30 hidden h-2 bg-sidebar md:block print:hidden" />}
      <SidebarInset className="min-w-0">
        <WorkspaceHeader workspace={workspace} navigation={navigation} access={access}
          unreadNotifications={unreadNotifications} tabBar={tabBar} focused={focused} />
        {children}
      </SidebarInset>
      {tabBar && <MobileTabBar workspace={workspace} navigation={navigation} />}
    </SidebarProvider>
  );
}
