# Florence frontend design principles

**Status:** Adopted 2026-11-16.

These are the rules for layout, placement, spacing, type, materials, motion and interaction in the Florence frontend. Values live in [`docs/Florence_Design_Tokens.md`](docs/Florence_Design_Tokens.md). Navigation, layout and caching rules in [`AGENTS.md` §4](AGENTS.md) still apply and win if the two disagree.

Apple's Human Interface Guidelines (HIG) are the reference. Florence is mostly used in mobile browsers and on laptops, not as a native Apple app. We follow the HIG because it sets the bar for what calm, premium software feels like, and because its rules come from measured ergonomics. We don't copy Apple's look. We use its principles with Florence's own palette and fonts.

## 1. Core principles

1. **Content first, chrome recedes.** Navigation and toolbars sit on a quiet functional layer above the content. They never compete with the data for attention. (HIG: hierarchy. Liquid Glass separates the functional layer from content.)
2. **One clear primary action per view.** Each screen has at most one filled button. Secondary actions are tonal or plain. Destructive actions stand apart from the primary one.
3. **Every motion has a reason.** Motion gives feedback (my tap registered), continuity (this is the same object, moved), or orientation (I went deeper or came back). Decoration alone is not a reason.
4. **Instant beats animated.** A response that shows at once feels faster than a smooth one that makes people wait. Never make people wait for an animation to finish before they can act.
5. **Consistency over novelty.** The same thing looks and moves the same way in every workspace. Shared patterns live in `src/components/layout/` and `src/components/ui/`.
6. **Fit the size class, not the device.** Layouts respond to available width (the HIG's compact and regular size classes), not to "phone" or "desktop".

## 2. Layout

### Size classes

| Width | Florence breakpoint | Navigation | Content |
|---|---|---|---|
| Compact | `< md` (768 px) | Bottom tab bar, plus "More" when needed | One column, full bleed, large page title |
| Regular | `≥ md` | Sidebar, collapsible to an icon rail | Centred readable column |

HIG: sidebars don't appear at compact widths. They become tab bars or list rows. Faculty and Admin have no tab bar, so they keep the sidebar drawer on phones.

### Workspaces with one destination

A workspace with only one destination (Council Representatives: Events) shows **no navigation chrome**. That means no sidebar, no drawer button and no tab bar. A single-item menu is noise. The header carries the brand, the page title and the account menu.

### Margins and readable width

- Side margins: 16 px compact, 24–32 px at `sm`, 40 px at `lg`. Match the iOS system margins of 16–20 pt.
- Content is capped at `max-w-5xl` (about 1024 px). A focused single-task view (Representatives, sign-in, account) caps at `max-w-2xl`. Long text never runs wider than about 75 characters.
- Respect safe areas: `env(safe-area-inset-*)` on every fixed bar, and on in-flow content for landscape notches.
- Don't nest scroll containers. One page scroll beats a fixed-height box that scrolls on its own. An internal scroll is allowed only for large tables, and only on regular widths.

### Layers

| Layer | What | Surface |
|---|---|---|
| Content | Page title, cards, lists, tables | Background and tonal Surface tokens. No blur. |
| Functional | Header, sidebar, tab bar | Frosted material (`backdrop-blur` with translucent background) or the sidebar tone |
| Modal | Sheets, dialogs, menus | Surface high with a shadow. The backdrop dims the content. |

Frosted material belongs only to the functional and modal layers, never to cards or content (HIG: don't use Liquid Glass in the content layer).

## 3. Placement

- **Page header:** title on the left (large title on phones). The primary page action goes top right on regular widths. On compact widths it goes under the title or in the header's trailing slot. It never floats over the tab bar.
- **Reachability:** on phones, frequent actions sit in the lower two-thirds. Navigation goes in the tab bar. Sheets open from the bottom.
- **Drill-down:** a detail view always shows a back affordance (chevron and parent name) top left. Navigation goes at most two levels deep below a tab.
- **Destructive actions** go last, in the destructive colour, and always ask for confirmation in a dialog that names the object.
- **Status** sits beside the object it describes (a badge in the row), not in a separate column people have to scan for.
- **Lists:** the label goes on the left and the value or status on the right. A chevron at the far right means the row navigates. A row without a chevron doesn't navigate.

## 4. Spacing and shape

- **Scale:** 4 px base, 8 px grid. Use only 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- **Related things sit closer than unrelated things.** Inside a group, use 8–12 px. Between groups, use 24–32 px. Between page sections, use 32–48 px.
- **Rows:** 44 px minimum on touch screens. On regular widths, sidebar rows are 32–36 px and table rows 44–48 px.
- **Concentric corners (HIG: harmony).** An inner radius equals the outer radius minus the padding between them. Example: a 24 px card with 8 px padding holds 16 px inner tiles. Pills and icon buttons are fully round.
- **Hairlines:** separators are 0.5–1 px in the Outline token. Inset list separators start where the text starts, not at the icon.

## 5. Typography

- **Two faces, fixed roles.** Be Vietnam Pro is the display face, for page titles, section titles, card headings and large balance numbers (`font-heading`). Inter is used for everything else: body, labels, buttons, table headers and form fields (`font-sans`, the default). Sizes and weights are in the tokens doc.
- **Use the classes, not ad-hoc sizes.** Page titles use `.page-title` and section headings use `.section-title`. Card and dialog titles use the `CardTitle` or `DialogTitle` component. Don't hand-roll `text-xl font-bold` headings.
- **Only the token weights:** Be Vietnam Pro Medium (500) and SemiBold (600). Inter Regular (400) and Medium (500). Don't use `font-bold`.
- Hierarchy comes from size and weight, not colour.
- **Self-host the fonts** through `next/font`, with no runtime request to a font service and a system fallback stack.
- Display sizes (20 px and up) get slightly tighter tracking (`-0.01em` to `-0.02em`), as Apple tightens SF at large sizes. Body text keeps default tracking.
- Numbers that change or line up (money, counts, times) use `tabular-nums`.
- **Large title on phones:** the page title is large at the top. Once it scrolls under the header, a compact centred title shows in a frosted header. This is already built with `ScrollEdge`.
- Body text is 14 px on regular widths. Inputs are at least 16 px on touch screens, so iOS doesn't zoom in on focus.

## 6. Colour and materials

- **Accent means interactive or selected.** Primary brown marks the selected item, the primary button and links. It doesn't decorate.
- Colour never carries meaning alone. Every status chip has a text label.
- Keep tab bars and sidebars monochrome, with the accent only on the selected item (HIG: tab bars).
- **Frosted recipe:** `bg-background/80 backdrop-blur-xl backdrop-saturate-150`, plus a 0.5 px hairline. Floating bars add a soft shadow.
- The app is light-only for now. Use only tokens, never raw hex values, so a dark theme can be added later.

## 7. Motion

### Values

| Kind | Duration | Easing | Use |
|---|---|---|---|
| Feedback | 100–150 ms | `ease-out` | Press, hover, colour change |
| Small move | 200–250 ms | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Header title swap, icon rotate, panel expand |
| Selection glide | 300–350 ms | `cubic-bezier(0.32, 0.72, 0, 1)` | Tab bar lens, sidebar selection pill |
| Large surface | 400–450 ms | `cubic-bezier(0.32, 0.72, 0, 1)` | Sheets, drawers, sidebar collapse |
| Content enter / exit | 160 ms / 90 ms | as in the tokens doc | Page crossfade |

`cubic-bezier(0.32, 0.72, 0, 1)` is the curve iOS uses for sheets. It starts fast and settles softly, like a critically damped spring, without overshooting.

### Rules

1. **Animate only `transform` and `opacity`** (plus `background-color` for feedback). Never animate width, height, top or left on content. If the sidebar collapse has to animate its width, it uses the large-surface easing, never `linear`.
2. **Exits are faster than entries.** What's leaving matters less than what's arriving.
3. **Interruptible.** Use CSS transitions for state changes (selection, open/closed), because they retarget smoothly when interrupted. Use keyframes only for one-off enters and exits.
4. **Chrome doesn't move on navigation.** The header, sidebar and tab bar stay put. Only their selection indicator glides to the new item. Content crossfades.
5. **No bounce or overshoot** on business data, and nothing that slows a repeated task (the QR station, row review).
6. **Reduced motion:** with `prefers-reduced-motion: reduce`, moves become instant or plain crossfades. This is already global in `globals.css`.

### Transitions by gesture

| Gesture | Transition |
|---|---|
| Switching tabs or sidebar items | Content crossfades. The selection indicator glides. No sliding pages (HIG: tab switches don't push). |
| Opening a detail (list → event) | A forward push on phones: the new view slides 60 px in from the trailing edge while the old one gives way and fades. The back link reverses it. Use `DrillTransition` in the page and `transitionTypes={["nav-forward"]}` or `["nav-back"]` on the links. |
| Browser Back or swipe | No direction is known, so content crossfades. Preserved routes show at once. |
| Sheet or drawer | Slides up from the bottom (phones). The backdrop fades. |
| Dialog or menu | Fades in from 96–98% scale, anchored to its trigger when possible. |
| Suspense content arrives | The skeleton crossfades into the content. The content keeps the skeleton's size, so nothing shifts. |

## 8. Interaction and feedback

- **Press states:** on touch, the element dims to 60% opacity at once (iOS's highlight behaviour). Icon tabs may also scale to 0.94. With a pointer, a tonal hover fill appears. No hover-only affordances.
- **Optimistic selection:** a tapped tab or sidebar item is highlighted at once. It doesn't wait for the server render. It falls back to the URL when the URL changes.
- **Tapping the current tab** scrolls to the top (an iOS convention, already built).
- **Pending state** shows where the change happens (AGENTS §4). Never cover the screen.
- **Focus** is always visible: a 2 px Primary outline with a 2 px offset. Keyboard order follows visual order.
- **Errors** sit next to the field or control. They say what happened and what to do next.

## 9. Navigation patterns

| Pattern | Rule |
|---|---|
| Tab bar | 2–5 tabs, each an icon plus a short label. A floating capsule above the content, inset from the screen edges. A "More" tab holds the rest. Hidden on routes outside the menu. |
| Sidebar | Grouped, monochrome, 16 px icons. Each icon matches its destination's meaning, and the same icon is used in the tab bar. A single selection pill glides between items. Collapses to an icon rail with tooltips. |
| Header | The phone header is flat at the top and frosted once content scrolls under it. On regular widths it holds the sidebar toggle and any global actions. |
| One destination | No navigation chrome (see §2). |

## 10. Accessibility

- WCAG 2.1 AA contrast. The known failures and proposed fixes are in the tokens doc.
- Touch targets are at least 44 × 44 px. Spacing between them stops wrong taps.
- `aria-current="page"` on the selected navigation item. Navigation landmarks get labels.
- Motion respects reduced motion. Nothing flashes more than three times a second.

## 11. Review checklist

Before merging a UI change, check that:

- [ ] Spacing uses the 8 px scale, corners are concentric, and there's at most one primary action per view.
- [ ] Only transform and opacity animate. Durations and easing come from §7, and reduced motion is respected.
- [ ] Chrome stays still on navigation. Only the selection indicator moves.
- [ ] Phone width: no horizontal scroll, 44 px targets, the tab bar clears the content, and safe areas are honoured.
- [ ] The AGENTS §4 checks pass in a production build.

## Sources

- Apple HIG: [Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars), [Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars), [Layout](https://developer.apple.com/design/human-interface-guidelines/layout), [Materials](https://developer.apple.com/design/human-interface-guidelines/materials), [Tab views](https://developer.apple.com/design/human-interface-guidelines/tab-views), [Split views](https://developer.apple.com/design/human-interface-guidelines/split-views)
- WWDC25: [Get to know the new design system](https://developer.apple.com/videos/play/wwdc2025/356/)
- WWDC20: [Designed for iPad](https://developer.apple.com/videos/play/wwdc2020/10206/) (sidebar to tab bar at compact widths)
- Next.js view transitions guide: `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`
