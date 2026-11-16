import { WorkspaceChrome } from "@/components/layout/workspace-chrome";

// The chrome reads the session; every page here blocks on it too (see AGENTS.md §4).
export const instant = false;

export default function FacultyLayout({ children }: LayoutProps<"/faculty">) {
  return <WorkspaceChrome workspace="faculty">{children}</WorkspaceChrome>;
}
