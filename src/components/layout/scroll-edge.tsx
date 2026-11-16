"use client";

import { useEffect, useRef } from "react";

/**
 * Wraps the page title. Sets `data-scrolled` on the workspace header once the title scrolls under it,
 * so the header can switch from flat to frosted and fade in its compact title (iOS large title).
 * Lives in the page, not the persistent header: preserved (hidden) pages clean up their Effects and
 * re-run them when shown again, so only the visible page's title is watched.
 */
export function ScrollEdge({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const header = document.querySelector<HTMLElement>("header[data-scroll-edge]");
    const target = ref.current;
    if (!header || !target) return;
    const observer = new IntersectionObserver(
      ([entry]) => header.toggleAttribute("data-scrolled", !entry.isIntersecting),
      { rootMargin: `-${header.offsetHeight}px 0px 0px 0px` },
    );
    observer.observe(target);
    return () => {
      observer.disconnect();
      header.removeAttribute("data-scrolled");
    };
  }, []);

  return <div ref={ref}>{children}</div>;
}
