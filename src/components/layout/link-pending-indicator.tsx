"use client";

import { useLinkStatus } from "next/link";

/** Pulsing dot inside a nav link while its navigation is pending. */
export function LinkPendingIndicator() {
  const { pending } = useLinkStatus();
  return <span className={`ml-auto size-2 rounded-full bg-primary transition-opacity ${pending ? "opacity-100 animate-pulse" : "opacity-0"}`} aria-hidden="true" />;
}
