"use client";

import { Drawer } from "@base-ui/react/drawer";

/** iOS-style grouped list styles shared by bottom sheets. */
export const sheetGroup = "overflow-hidden rounded-2xl bg-background divide-y divide-border/70";
export const sheetRow = "flex min-h-12 w-full items-center gap-3 px-4 text-left text-[15px] transition-colors duration-150 [-webkit-tap-highlight-color:transparent] active:bg-muted focus-visible:bg-muted focus-visible:outline-none [@media(hover:hover)]:hover:bg-muted/60";
export const sheetIconTile = "flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:size-4";

const ease = "ease-[cubic-bezier(0.32,0.72,0,1)]";

/** Bottom sheet with a grab handle, swipe-down to dismiss and the iOS sheet curve. Phones only. */
export function BottomSheet({ open, onOpenChange, trigger, triggerLabel, triggerClassName, icon, title, description, children }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  triggerLabel: string;
  triggerClassName: string;
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Trigger aria-label={triggerLabel} className={triggerClassName}>{trigger}</Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Backdrop className={`fixed inset-0 z-50 min-h-dvh bg-black opacity-[calc(0.3*(1-var(--drawer-swipe-progress)))] transition-opacity duration-[450ms] ${ease} data-swiping:duration-0 data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] supports-[-webkit-touch-callout:none]:absolute`} />
        <Drawer.Viewport className="fixed inset-0 z-50 flex items-end justify-center">
          <Drawer.Popup className={`max-h-[85dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-3xl bg-card px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] text-foreground shadow-lg outline-none [transform:translateY(var(--drawer-swipe-movement-y))] transition-transform duration-[450ms] ${ease} data-swiping:select-none data-starting-style:[transform:translateY(calc(100%+2px))] data-ending-style:[transform:translateY(calc(100%+2px))] data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)]`}>
            <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-foreground/20" />
            <Drawer.Content className="flex flex-col gap-4">
              <div className="flex items-center gap-3 px-1">
                {icon}
                <div className="grid min-w-0 leading-tight">
                  <Drawer.Title className="truncate font-heading text-base font-semibold">{title}</Drawer.Title>
                  {description && <Drawer.Description className="truncate text-sm text-muted-foreground">{description}</Drawer.Description>}
                </div>
              </div>
              {children}
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
