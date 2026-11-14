import { cn } from "@/lib/utils";

/**
 * Batch progress bar. `pending` is work sent but not yet confirmed; it pulses so the bar
 * never looks frozen. With value 0 and pending = max it reads as "working, size unknown".
 */
export function ProgressBar({
  value,
  max,
  label,
  pending = 0,
  tone = "primary",
}: {
  value: number;
  max: number;
  label: string;
  pending?: number;
  tone?: "primary" | "success";
}) {
  const pct = (n: number) => (max === 0 ? 0 : Math.round((Math.min(n, max) / max) * 100));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className="relative h-2 w-full overflow-hidden rounded-full bg-muted"
    >
      {pending > 0 && (
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary/30 transition-[width] duration-500 motion-safe:animate-pulse"
          style={{ width: `${pct(value + pending)}%` }}
        />
      )}
      <div
        className={cn(
          "relative h-full rounded-full transition-[width] duration-500",
          tone === "success" ? "bg-emerald-600" : "bg-primary",
        )}
        style={{ width: `${pct(value)}%` }}
      />
    </div>
  );
}
