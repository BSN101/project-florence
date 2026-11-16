"use client";

import { ViewTransition } from "react";

/**
 * Fades page content on navigation (phones only, see globals.css). Rendered inside each page, not
 * keyed by pathname in the layout: a key would re-mount the subtree and discard the routes Next.js
 * keeps alive with <Activity>, so Back would rebuild the page instead of showing it at once.
 * Search-param changes (the semester filter) and refreshes keep it mounted and still.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="page-fade" exit="page-fade" default="none">
      {children}
    </ViewTransition>
  );
}
