const MANILA_DATE_FORMATTER = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  dateStyle: "medium",
});

const MANILA_DATETIME_FORMATTER = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  dateStyle: "medium",
  timeStyle: "short",
});

/** Formats a calendar date (`YYYY-MM-DD`) or ISO timestamp as a medium `Asia/Manila` date, e.g. "Nov 25, 2026", or `"—"` when blank/invalid. */
export function formatManilaDate(dateStr: string | null | undefined): string {
  const trimmed = dateStr?.trim();
  if (!trimmed) return "—";
  const ms = Date.parse(trimmed.includes("T") ? trimmed : `${trimmed}T00:00:00+08:00`);
  return Number.isNaN(ms) ? "—" : MANILA_DATE_FORMATTER.format(new Date(ms));
}

/** Formats an ISO timestamp as a medium `Asia/Manila` date and time, e.g. "Nov 25, 2026, 5:02 PM", or `"—"` when blank/invalid. */
export function formatManilaDateTime(iso: string | null | undefined): string {
  const trimmed = iso?.trim();
  if (!trimmed) return "—";
  const ms = Date.parse(trimmed);
  return Number.isNaN(ms) ? "—" : MANILA_DATETIME_FORMATTER.format(new Date(ms));
}
