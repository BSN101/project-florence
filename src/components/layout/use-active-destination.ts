"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";

import type { Workspace } from "@/features/access/access-policy";

/**
 * The navigation item to highlight. A clicked item lights up at once (it does not wait for the
 * server render) and falls back to the URL as soon as the pathname changes, so Back to the page
 * it was clicked from never re-highlights it.
 */
export function useActiveDestination(workspace: Workspace) {
  const pathname = usePathname();
  const [tapped, setTapped] = useState<{ from: string; slug: string } | null>(null);
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setTapped(null);
  }

  const currentSlug = pathname.replace(new RegExp(`^/${workspace}/?`), "");
  const activeSlug = tapped?.from === pathname ? tapped.slug : currentSlug;

  function tap(event: React.MouseEvent, slug: string) {
    // New-tab and download clicks don't navigate this page.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    setTapped({ from: pathname, slug });
  }

  return { currentSlug, activeSlug, tap };
}
