import "server-only";

import type { Workspace } from "../../features/access/access-policy";
import { getAccessContext, type AccessContext } from "./access-context";

export class AccessDeniedError extends Error {
  constructor(public readonly status: Exclude<AccessContext["status"], "ready"> | "forbidden") {
    super(`Workspace access denied: ${status}`);
    this.name = "AccessDeniedError";
  }
}

/** Guard server entry points; workspace access does not authorize individual actions. */
export async function requireWorkspace(workspace: Workspace): Promise<Extract<AccessContext, { status: "ready" }>> {
  const context = await getAccessContext();
  if (context.status !== "ready") throw new AccessDeniedError(context.status);
  if (!context.workspaces.includes(workspace)) throw new AccessDeniedError("forbidden");
  return context;
}
