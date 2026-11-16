"use client";

import { use } from "react";

/** Unread badge, streamed: the chrome renders at once and the count fills in when it resolves. */
export function NotificationCount({ count, variant }: { count: Promise<number>; variant: "header" | "sidebar" }) {
  const unread = use(count);
  if (unread <= 0) return null;
  const text = unread > 99 ? "99+" : unread;
  const title = `${unread} unread notification${unread === 1 ? "" : "s"}`;
  return variant === "header"
    ? <span title={title} className="absolute -top-1 -right-1 flex min-w-4 h-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground shadow-xs animate-in fade-in zoom-in">{text}</span>
    : <span title={title} className="ml-auto flex min-w-5 h-5 items-center justify-center rounded-full bg-primary/15 text-primary px-1.5 text-[10px] font-semibold">{text}</span>;
}
