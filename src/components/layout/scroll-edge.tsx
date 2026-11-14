"use client";

import { useEffect, useRef } from "react";

/**
 * Sets `data-scrolled` on the enclosing header once the element `watch` scrolls under it,
 * so the header can switch from flat to frosted and fade in its compact title (iOS large title).
 */
export function ScrollEdge({ watch }: { watch: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const header = ref.current?.closest("header");
    const target = document.getElementById(watch);
    if (!header || !target) return;
    const observer = new IntersectionObserver(
      ([entry]) => header.toggleAttribute("data-scrolled", !entry.isIntersecting),
      { rootMargin: `-${header.offsetHeight}px 0px 0px 0px` },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [watch]);

  return <span ref={ref} hidden />;
}
