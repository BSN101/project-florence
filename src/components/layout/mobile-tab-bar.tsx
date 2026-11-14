"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Ellipsis,
  FileChartColumn,
  HandCoins,
  House,
  Landmark,
  Medal,
  Scale,
  School,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

import { BottomSheet, sheetGroup, sheetIconTile, sheetRow } from "@/components/layout/bottom-sheet";
import type { Workspace } from "@/features/access/access-policy";
import { destinationHref, type NavigationItem } from "@/features/access/workspace-navigation";

const icons: Record<string, LucideIcon> = {
  "student/": House,
  "student/events": CalendarDays,
  "student/fees-and-fines": CircleDollarSign,
  "student/merits-demerits-and-services": Medal,
  "student/clearance": ClipboardCheck,
  "council/": Users,
  "council/events": CalendarDays,
  "council/fees-and-fines": CircleDollarSign,
  "council/payments": HandCoins,
  "council/merit-endorsements-and-council-demerits": Scale,
  "council/clearance": ClipboardCheck,
  "council/reports": FileChartColumn,
  "council/semesters": School,
  "council/council-members": ShieldCheck,
  "council/payment-accounts": Landmark,
};
const iconFor = (workspace: Workspace, slug: string) => icons[`${workspace}/${slug}`] ?? Ellipsis;

const tab = "flex min-h-[49px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium leading-none transition-[color,opacity] duration-150 [-webkit-tap-highlight-color:transparent] active:opacity-60 focus-visible:outline-offset-[-2px]";

/** Phone bottom tab bar (below md). Lives in the workspace layout so it stays mounted while pages load. */
export function MobileTabBar({ workspace, navigation }: { workspace: Workspace; navigation: NavigationItem[] }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  // Highlight a tapped tab at once; it falls back to the URL as soon as the pathname changes.
  const [tapped, setTapped] = useState<{ from: string; slug: string } | null>(null);

  const currentSlug = pathname.replace(new RegExp(`^/${workspace}/?`), "");
  // Off-menu routes (the full-screen QR station, not-found pages) get no tab bar.
  if (!navigation.some((item) => item.slug === currentSlug)) return null;

  const activeSlug = tapped?.from === pathname ? tapped.slug : currentSlug;
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
    setTapped({ from: pathname, slug });
  }

  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 border-t-[0.5px] border-border bg-background/85 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur-xl backdrop-saturate-150 md:hidden">
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length + (more.length ? 1 : 0)}, minmax(0, 1fr))` }}>
        {tabs.map((item) => {
          const Icon = iconFor(workspace, item.slug);
          const active = item.slug === activeSlug;
          return (
            <li key={item.slug}>
              <Link href={destinationHref(workspace, item.slug)} aria-current={active ? "page" : undefined}
                onClick={(event) => select(event, item.slug)}
                className={`${tab} ${active ? "text-primary" : "text-muted-foreground"}`}>
                <Icon className="size-6" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
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
              trigger={<><Ellipsis className="size-6" strokeWidth={moreActive ? 2.25 : 1.75} aria-hidden />More</>}
              triggerLabel="More destinations"
              triggerClassName={`${tab} w-full ${moreActive ? "text-primary" : "text-muted-foreground"}`}
              title="More"
            >
              <ul className={sheetGroup}>
                {more.map((item) => {
                  const Icon = iconFor(workspace, item.slug);
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
