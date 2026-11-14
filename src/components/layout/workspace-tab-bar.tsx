import type { Workspace } from "@/features/access/access-policy";
import { getWorkspaceNavigation, hasMobileTabBar } from "@/features/access/workspace-navigation";
import { getAccessContext } from "@/server/auth/access-context";
import { MobileTabBar } from "./mobile-tab-bar";

/** Resolves the actor's menu for the phone tab bar. Pages still enforce access; this only hides links. */
export async function WorkspaceTabBar({ workspace }: { workspace: Workspace }) {
  const access = await getAccessContext();
  if (access.status !== "ready" || !access.workspaces.includes(workspace)) return null;
  const navigation = getWorkspaceNavigation(workspace, access);
  return hasMobileTabBar(navigation) ? <MobileTabBar workspace={workspace} navigation={navigation} /> : null;
}
