# Florence Design Tokens

**Version:** 0.2 · **Updated:** 2026-11-07

## Purpose

A standalone reference for colour, typography, shape, spacing and accessibility. Visual labels do not define business states, permissions, screens or workflows. **Proposed** choices need sign-off; **Tentative** choices are optional candidates, not approved defaults.

## Implementation conventions

- Define runtime tokens once in `src/app/globals.css` as CSS custom properties; map them into the application styling system rather than repeat raw values in components.
- Keep this document as the human-readable reference for values, usage and pending choices.
- The base palette contains estimates and known contrast failures; it is not production-ready. Contrast figures below are recorded calculations, not newly measured results. Recheck final colour pairs and rendered focus/input states before release.
- Hover colours, card-heading size and reduced-motion behavior are unspecified; no approved values are implied.
- Day-based disciplinary and service quantities use whole days; monetary amounts use PHP, not days.

**Proposed token/theme setup:** Define light and dark CSS custom-property sets, mapped into the styling system without hard-coded component colours. Light is the proposed default; dark is recommended for dim venues such as event check-in, not an approved requirement. Any print-friendly output uses light colours and no gradients; this does not commit to new printable features.

## Colour tokens

Brown, teal and grey values are estimates and may be refined.

| Role | Light | Dark |
|---|---|---|
| Background | `#FFF8F2` | `#1B1512` |
| Surface (cards) | `#F5EBE6` | `#251D19` |
| Surface container (nav pill, inputs) | `#EFE4DF` | `#2F2622` |
| Surface high (sheets, menus) | `#E8DCD6` | `#3A302B` |
| Primary (filled button, active nav) | `#7B5844` | `#FBCEB1` |
| On primary | `#FFFFFF` | `#2E1500` |
| Primary container | `#FBCEB1` | `#5D4030` |
| On primary container | `#2E1500` | `#FBCEB1` |
| Tertiary container (info) | `#BCDCE6` | `#2C4A55` |
| Tertiary (teal) | `#46636E` | `#BCDCE6` |
| On tertiary container | `#0F2A33` | `#D3EEF8` |
| Inverted button | bg `#353230`, text `#FFF8F2` | bg `#F2E7E1`, text `#1B1512` |
| Text primary | `#211D1A` | `#EFE4DF` |
| Text secondary | `#4D4541` | `#CFC4BE` |
| Neutral (borders, disabled, services bar) | `#7C7673` | `#A39B97` |
| Outline | `#CFC6C1` | `#5A514C` |
| Error | `#C4161C` on `#FFDAD6` | `#FFB4AB` on `#93000A` |
| Success | `#4F7A5A` on `#D6EBD8` | `#A8D5B0` on `#2F4A36` |
| Warning | `#9A6A1F` on `#F8E3B8` | `#F1C77A` on `#5A4416` |

Brand seeds: Primary `#FBCEB1`, Secondary `#FFF8F2`, Tertiary `#BCDCE6`, Neutral `#7C7673`.

## Semantic colour usage

Data series: brown = demerits, grey = services, teal = merit credits and fee collection. These colours do not require charts or additional analytics.

Status chips always carry a text label; colour is never the only carrier of meaning. Retained mappings for current states (not an exhaustive state catalog):

| Domain | Mapping |
|---|---|
| Demerit | Waived = neutral |
| Merit | Available = success; Applied = tertiary; Expired = neutral |
| Transfer submission | Pending = warning; Verified = success; Rejected = error |
| Event attendance | Late = warning; Absent = error |
| Event attendance finalization | Open = success |
| Endorsement | Approved = success; Rejected = error |
| Clearance component | Cleared = success |

## Typography

Sizes are font size/line height in px; card-heading size remains unspecified.

| Use | Font | Weight and size |
|---|---|---|
| Page title | Be Vietnam Pro | SemiBold, 28/36 |
| Section title | Be Vietnam Pro | SemiBold, 20/28 |
| Card heading | Be Vietnam Pro | Medium |
| Large balance number | Be Vietnam Pro | SemiBold, 40/44 |
| Body | Inter | Regular, 14/20 |
| Labels | Inter | Medium, 12/16 |
| Buttons | Inter | Medium, 14/20 |
| Table headers | Inter | Medium, 11/16, uppercase optional |

**Proposed font delivery:** Self-host through the framework's font optimization, with no runtime third-party font request. Limit weights to those above and provide a system-font fallback stack.

**Proposed glyph check:** Verify the peso sign (₱, U+20B1), en-dash (–) and middle-dot (·) in both fonts; supply missing glyphs through a fallback font.

## Shape, spacing and state
- 8 px spacing grid.
- Corner radius: cards 24 px; buttons and inputs 12 to 16 px; nav pill and icon buttons fully round.
- Tonal surfaces. Gradients remain tentative and decorative only (see below). Shadows only on sheets and menus.
- Focus: 2 px outline in the Primary colour with 2 px offset. Disabled: neutral text on surface container.
- Minimum tap target 44 px on mobile.
- Ledger data shows no delete or trash affordance. Use the authorized action's label, such as "Waive" or "Revoke service credit"; do not imply a generic reversal workflow.
- Day-based balances and quantities display in whole days (for example "3 days"), not fractional days or currency.

## Contrast and pending corrections

Recorded WCAG 2.1 contrast ratios; not recalculated in this revision. Thresholds: 4.5:1 for normal text, 3:1 for non-text UI components.

| Pair | Light | Dark |
|---|---|---|
| Text primary on Background | 15.90 pass | 14.48 pass |
| Text secondary on Background | 8.90 pass | 10.57 pass |
| Text secondary on Surface container | 7.50 pass | 8.65 pass |
| On primary on Primary | 6.32 pass | 11.91 pass |
| On primary container on Primary container | 11.91 pass | 6.50 pass |
| On tertiary container on Tertiary container | 10.38 pass | 7.83 pass |
| Inverted button text on fill | 12.10 pass | 14.87 pass |
| Error on error container | 4.67 pass (marginal) | 5.51 pass |
| **Success on success container** | **3.92 fail** | 5.95 pass |
| **Warning on warning container** | **3.74 fail** | 5.80 pass |
| **Neutral text on Background** | **4.25 fail** | 6.62 pass |
| **Neutral text on Surface** | **3.81 fail** | n/a |
| **Neutral text on Surface container (disabled, Waived chip)** | **3.58 fail** | 5.41 pass |
| Outline versus Background (non-text, 3:1) | **1.60 fail** | **2.34 fail** |
| Neutral (services bar) versus Background (non-text) | 4.25 pass | 6.62 pass |
| Teal bar versus Background (non-text) | 6.10 pass | 12.49 pass |

**Findings.** All listed dark-theme text pairs pass. In the light theme, neutral text, the success chip, and the warning chip fail AA for normal text, and the outline colour is too faint to identify an input boundary.

**Proposed corrections — sign-off pending.** Recorded ratios meet the thresholds; these values do not yet replace the base tokens:

| Token | Change | Resulting ratio |
|---|---|---|
| Neutral **text** (light) | `#67615E` (keep `#7C7673` for non-text fills such as the services bar) | 5.79 on Background, 5.19 on Surface, 4.88 on Surface container |
| Success chip text (light) | `#3F6A4B` on `#D6EBD8` | 4.96 |
| Warning chip text (light) | `#7A5410` on `#F8E3B8` | 5.37 |
| Input boundary "outline strong" (light) | `#8A827E` | 3.58 on Background, 3.21 on Surface, 3.02 on Surface container |
| Input boundary "outline strong" (dark) | `#857B76` | 4.38 on Background, 4.01 on Surface, 3.58 on Surface container |

The existing Outline token stays for decorative dividers only. These adjustments need design sign-off, and the brown and teal ramps should be re-checked once final values exist.

## Gradients and extended palette

**Tentative gradient use:** Optional decorative surfaces only, such as balance cards, page headers and empty states. Use at most two gradient tokens, at 135 degrees, never animated. No gradients on status chips, data series or printables. This is not an approved default.

**Proposed extended tokens — sign-off pending.** Values and recorded contrast figures have not been newly validated:

| Token | Light | Dark | Contrast |
|---|---|---|---|
| Apricot light | `#FFE3D1` | n/a | Text primary 13.67, text secondary 7.65 |
| Blush | `#FBD7E0` | n/a | Text primary 12.66, text secondary 7.09 |
| Warm gradient | `#FFE3D1` to `#FBD7E0` | `#4A3326` to `#4A2A36` | Light, worst stop: primary 12.66, secondary 7.09. Dark: primary 9.39, secondary 6.86 |
| Strong gradient (decorative, no body text) | `#FFB38A` to `#EFA3BC` | n/a | Text primary 8.47; secondary 4.74 (marginal) |
| Rose accent | `#9A3F5E` | `#F4B6CA` | Light: white on rose 6.47, rose on Background 6.15, on Surface 5.52. Dark: rose on Background 10.66, on Surface container 8.72 |

The Rose accent may sit beside Primary as an emphasis colour or replace it for headline elements; that is a design sign-off decision.

**Proposed gradient text rule:** Only Text primary and Text secondary appear on gradient surfaces. Neutral text does not: on the stronger fills it measures 4.41 (Apricot `#FFD3B0`), 3.50 (Apricot strong `#FFB38A`), 4.06 (Pink `#F7C6D4`), and 3.08 (Pink strong `#EFA3BC`), which fails or nearly fails AA.

**Proposed decorative-colour rule:** Pink and apricot are decorative. Error, warning, and success keep their own hues and text labels in status chips, so decorative colour never carries status meaning. All pairs are re-audited when final values are chosen.

## Revision

0.2 · 2026-11-07 — Simplified into a standalone visual reference; preserved token values, pending choices and contrast warnings. No CSS changes or new contrast validation.
