import { Suspense } from "react";

import { PageTransition } from "@/components/layout/page-transition";
import { WorkspaceTabBar } from "@/components/layout/workspace-tab-bar";

export default function CouncilLayout({ children }: LayoutProps<"/council">) {
  return (
    <>
      <PageTransition>{children}</PageTransition>
      <Suspense><WorkspaceTabBar workspace="council" /></Suspense>
    </>
  );
}
