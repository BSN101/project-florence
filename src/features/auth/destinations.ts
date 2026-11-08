import type { Workspace } from "@/features/access/access-policy";

const workspaceDestinations = ["/student", "/council", "/faculty", "/admin"] as const;
const destinations = [...workspaceDestinations, "/account"] as const;
export type SafeDestination = (typeof destinations)[number];

export function safeDestination(value: unknown): SafeDestination | null {
  return typeof value === "string" && destinations.some((path) => path === value)
    ? value as SafeDestination : null;
}

export function defaultWorkspaceDestination(workspaces: readonly Workspace[]) {
  return `/${workspaces[0]}` as `/${Workspace}`;
}

export function authorizedDestination(destination: SafeDestination | null, workspaces: readonly Workspace[]) {
  if (destination === "/account") return destination;
  return destination && workspaces.includes(destination.slice(1) as Workspace) ? destination : null;
}
