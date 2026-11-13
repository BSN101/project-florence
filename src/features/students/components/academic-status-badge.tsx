import { cn } from "@/lib/utils";

export interface AcademicStatusBadgeProps {
  status: "regular" | "irregular" | string;
  className?: string;
  size?: "sm" | "md";
}

export function AcademicStatusBadge({
  status,
  className,
  size = "md",
}: AcademicStatusBadgeProps) {
  const isRegular = status.toLowerCase() === "regular";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-semibold",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-0.5 text-xs",
        isRegular
          ? "border border-primary/30 bg-primary/10 text-primary"
          : "border border-amber-600/30 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
        className,
      )}
    >
      {isRegular ? "Regular" : "Irregular"}
    </span>
  );
}
