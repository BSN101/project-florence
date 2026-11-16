import { WorkspaceChrome } from "@/components/layout/workspace-chrome";

// The chrome reads the session; every page here blocks on it too (see AGENTS.md, Rendering and navigation).
export const instant = false;

export default function CouncilLayout({ children }: LayoutProps<"/council">) {
  return <WorkspaceChrome workspace="council">{children}</WorkspaceChrome>;
}
