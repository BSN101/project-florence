import { Suspense } from "react";

import { PageTransition } from "@/components/layout/page-transition";
import { WorkspaceTabBar } from "@/components/layout/workspace-tab-bar";

export default function StudentLayout({ children }: LayoutProps<"/student">) {
  return (
    <>
      <PageTransition>{children}</PageTransition>
      <Suspense><WorkspaceTabBar workspace="student" /></Suspense>
    </>
  );
}
