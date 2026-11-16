import { WorkspaceChrome } from "@/components/layout/workspace-chrome";

// The chrome reads the session; every page here blocks on it too (see AGENTS.md §4).
export const instant = false;

export default function StudentLayout({ children }: LayoutProps<"/student">) {
  return <WorkspaceChrome workspace="student">{children}</WorkspaceChrome>;
}
