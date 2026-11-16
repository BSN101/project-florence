"use client";

import { ViewTransition } from "react";

const VIEW_TRANSITION_PATCHED = Symbol.for("florence.viewTransitionPatched");

/**
 * Suppresses harmless browser-level unhandled rejection overlays when a ViewTransition
 * is aborted because the tab was hidden or backgrounded during navigation.
 */
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    const err = event.reason;
    if (
      err &&
      (err.name === "InvalidStateError" ||
        (typeof err.message === "string" &&
          err.message.includes("Transition was aborted because of invalid state")))
    ) {
      event.preventDefault();
    }
  });
}

/**
 * Normalizes browser-specific ViewTransition abort messages (e.g. Chrome appending
 * ". Document hidden" when tab is backgrounded) so that React 19's exact-match
 * error filter recognizes and cleanly suppresses the harmless hidden-document abort.
 */
if (
  typeof document !== "undefined" &&
  typeof document.startViewTransition === "function" &&
  !(VIEW_TRANSITION_PATCHED in document.startViewTransition)
) {
  const originalStartViewTransition = document.startViewTransition.bind(document);

  const patchedStartViewTransition = function (
    this: Document,
    updateCallback?: (() => Promise<void> | void) | { update?: () => Promise<void> | void; types?: string[] }
  ) {
    const transition = (originalStartViewTransition as (args?: unknown) => ViewTransition)(updateCallback);

    if (transition) {
      if (transition.ready) {
        const originalReady = transition.ready;
        originalReady.catch(() => {});

        const patchedReady = originalReady.catch((err) => {
          if (
            err &&
            err.name === "InvalidStateError" &&
            typeof err.message === "string" &&
            err.message.startsWith("Transition was aborted because of invalid state")
          ) {
            try {
              Object.defineProperty(err, "message", {
                value: "Transition was aborted because of invalid state",
                configurable: true,
              });
            } catch {
              // Ignore defineProperty restrictions on native DOMException
            }
          }
          return Promise.reject(err);
        });
        patchedReady.catch(() => {});

        try {
          Object.defineProperty(transition, "ready", {
            value: patchedReady,
            configurable: true,
          });
        } catch {
          // Ignore
        }
      }

      if (transition.finished) {
        transition.finished.catch(() => {});
      }
    }

    return transition;
  };

  Object.defineProperty(patchedStartViewTransition, VIEW_TRANSITION_PATCHED, {
    value: true,
    configurable: false,
  });

  document.startViewTransition = patchedStartViewTransition;
}

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

const push = { "nav-forward": "push-forward", "nav-back": "push-back", default: "none" };

/**
 * Directional push for a drill-down inside one page (event list → event detail), keyed by what is
 * shown. Links opt in with transitionTypes={["nav-forward"]} or ["nav-back"]; browser Back carries no
 * type, so it swaps without motion. Phones only (globals.css). Render it inside the page, never a layout.
 */
export function DrillTransition({ id, children }: { id: string; children: React.ReactNode }) {
  return <ViewTransition key={id} enter={push} exit={push} default="none">{children}</ViewTransition>;
}
