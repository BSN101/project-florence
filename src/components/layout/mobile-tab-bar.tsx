"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight, Ellipsis } from "lucide-react";

import { BottomSheet, sheetGroup, sheetIconTile, sheetRow } from "@/components/layout/bottom-sheet";
import { navigationIcon } from "@/components/layout/navigation-icons";
import { useActiveDestination } from "@/components/layout/use-active-destination";
import type { Workspace } from "@/features/access/access-policy";
import { destinationHref, type NavigationItem } from "@/features/access/workspace-navigation";

// The press dims the tab (iOS highlight) and scales the icon slightly; the lens behind it shows selection.
const tab = "group/tab relative z-10 flex h-14 flex-col items-center justify-center gap-1 rounded-full text-[10px] font-medium leading-none transition-[color,opacity] duration-150 [-webkit-tap-highlight-color:transparent] active:opacity-60 focus-visible:outline-offset-[-2px]";
const icon = "size-6 transition-transform duration-100 ease-out group-active/tab:scale-[0.94]";

/** Phone bottom tab bar (below md). Lives in the workspace layout so it stays mounted while pages load. */
export function MobileTabBar({ workspace, navigation }: { workspace: Workspace; navigation: NavigationItem[] }) {
  const { currentSlug, activeSlug, tap } = useActiveDestination(workspace);
  const [moreOpen, setMoreOpen] = useState(false);

  // Off-menu routes (the full-screen QR station, not-found pages) get no tab bar.
  if (!navigation.some((item) => item.slug === currentSlug)) return null;

  const tabs = navigation.filter((item) => item.shortLabel);
  // Student's only untabbed item, Notifications, is the header bell.
  const more = workspace === "student" ? [] : navigation.filter((item) => !item.shortLabel);
  const moreActive = more.some((item) => item.slug === activeSlug);

  function select(event: React.MouseEvent, slug: string) {
    setMoreOpen(false);
    if (slug === currentSlug) {
      // iOS convention: tapping the current tab scrolls back to the top.
      event.preventDefault();
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      return;
    }
    tap(event, slug);
  }

  const columns = tabs.length + (more.length ? 1 : 0);
  const selected = moreActive ? tabs.length : tabs.findIndex((item) => item.slug === activeSlug);

  return (
    // Floating capsule above the content (iOS 26 tab bar), clear of the home indicator and landscape notch.
    <nav aria-label="Primary" data-print-chrome className="fixed inset-x-[max(0.75rem,env(safe-area-inset-left))] bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 rounded-full border-[0.5px] border-border/80 bg-background/75 p-1 shadow-[0_8px_24px_-8px_rgb(33_29_26/0.25)] backdrop-blur-xl backdrop-saturate-150 md:hidden" style={{ viewTransitionName: "workspace-tab-bar" }}>
      <ul className="relative grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {selected >= 0 && (
          // The lens: one capsule that glides to the selected tab; it moves on tap, before the page renders.
          <li aria-hidden className="pointer-events-none absolute inset-y-0 left-0 transition-[translate] duration-[350ms] ease-glide"
            style={{ width: `${100 / columns}%`, translate: `${selected * 100}% 0` }}>
            <span className="absolute inset-0 rounded-full bg-primary/10" />
          </li>
        )}
        {tabs.map((item) => {
          const Icon = navigationIcon(workspace, item.slug);
          const active = item.slug === activeSlug;
          return (
            <li key={item.slug}>
              <Link href={destinationHref(workspace, item.slug)} aria-current={active ? "page" : undefined}
                onClick={(event) => select(event, item.slug)}
                className={`${tab} ${active ? "text-primary" : "text-muted-foreground"}`}>
                <Icon className={icon} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                {item.shortLabel}
              </Link>
            </li>
          );
        })}
        {more.length > 0 && (
          <li>
            <BottomSheet
              open={moreOpen}
              onOpenChange={setMoreOpen}
              trigger={<><Ellipsis className={icon} strokeWidth={moreActive ? 2.25 : 1.75} aria-hidden />More</>}
              triggerLabel="More destinations"
              triggerClassName={`${tab} w-full ${moreActive ? "text-primary" : "text-muted-foreground"}`}
              title="More"
            >
              <ul className={sheetGroup}>
                {more.map((item) => {
                  const Icon = navigationIcon(workspace, item.slug);
                  return (
                    <li key={item.slug}>
                      <Link href={destinationHref(workspace, item.slug)} className={sheetRow}
                        aria-current={item.slug === activeSlug ? "page" : undefined}
                        onClick={(event) => select(event, item.slug)}>
                        <span className={sheetIconTile}><Icon /></span>
                        <span className="flex-1">{item.label}</span>
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </BottomSheet>
          </li>
        )}
      </ul>
    </nav>
  );
}
