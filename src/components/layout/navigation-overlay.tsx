"use client";

import { LoaderCircle } from "lucide-react";
import { useLinkStatus } from "next/link";
import { createPortal } from "react-dom";

export function NavigationOverlay({ visible, label }: { visible: boolean; label: string }) {
  if (!visible) return null;
  // Portalled so a transformed ancestor (the mobile sidebar sheet) cannot confine the fixed overlay.
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/70 backdrop-blur-[1px] [animation:fade-in_150ms_ease_100ms_both]" role="status" aria-live="polite">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4 shadow-lg">
        <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden="true" />
        <span className="font-medium">{label}</span>
      </div>
    </div>,
    document.body,
  );
}

export function LinkPendingIndicator() {
  const { pending } = useLinkStatus();
  return <span className={`ml-auto size-2 rounded-full bg-primary transition-opacity ${pending ? "opacity-100 animate-pulse" : "opacity-0"}`} aria-hidden="true" />;
}
