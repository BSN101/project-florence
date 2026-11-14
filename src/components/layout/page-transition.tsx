"use client";

import { usePathname } from "next/navigation";
import { ViewTransition } from "react";

/**
 * Fades the page on navigation (phones only, see globals.css). Keyed by pathname so React sees an
 * exit/enter pair at the top level, which is the only place enter/exit fire. Search-param changes
 * (the semester filter) and refreshes keep the same key and stay still.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <ViewTransition key={pathname} enter="page-fade" exit="page-fade" default="none">
      {children}
    </ViewTransition>
  );
}
