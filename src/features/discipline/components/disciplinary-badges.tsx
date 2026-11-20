import { cn } from "@/lib/utils";
import type { DisciplinaryBucket } from "../contracts";

export function BucketBadge({
  bucket,
  className,
}: {
  bucket: DisciplinaryBucket | string;
  className?: string;
}) {
  const isOffice = bucket.toLowerCase() === "office";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
        isOffice
          ? "border border-sky-600/30 bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
          : "border border-teal-600/30 bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300",
        className
      )}
    >
      {isOffice ? "Office" : "RLE"}
    </span>
  );
}

export function DemeritStatusBadge({
  waived,
  className,
}: {
  waived: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        waived
          ? "border border-muted-foreground/30 bg-muted text-muted-foreground"
          : "border border-destructive/30 bg-destructive/10 text-destructive font-semibold",
        className
      )}
    >
      {waived ? "Waived" : "Active Sanction"}
    </span>
  );
}

export function MeritStatusBadge({
  isApplied,
  isExpired,
  appliedBucket,
  className,
}: {
  isApplied?: boolean;
  isExpired?: boolean;
  appliedBucket?: DisciplinaryBucket | null;
  className?: string;
}) {
  if (isApplied) {
    const bucketLabel =
      appliedBucket === "office"
        ? " (Office)"
        : appliedBucket === "rle"
        ? " (RLE)"
        : "";
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full border border-purple-600/30 bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-800 dark:bg-purple-950/40 dark:text-purple-300",
          className
        )}
      >
        Applied{bucketLabel}
      </span>
    );
  }
  if (isExpired) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full border border-amber-600/30 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
          className
        )}
      >
        Expired
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-emerald-600/30 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
        className
      )}
    >
      Available
    </span>
  );
}

export function ServiceCreditBadge({
  revoked,
  className,
}: {
  revoked: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        revoked
          ? "border border-destructive/30 bg-destructive/10 text-destructive line-through"
          : "border border-emerald-600/30 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
        className
      )}
    >
      {revoked ? "Credit Revoked" : "Credit Active"}
    </span>
  );
}

export function EndorsementStatusBadge({
  status,
  className,
}: {
  status: "pending" | "approved" | "rejected" | string;
  className?: string;
}) {
  const s = status.toLowerCase();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize",
        s === "approved" &&
          "border border-emerald-600/30 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
        s === "rejected" &&
          "border border-destructive/30 bg-destructive/10 text-destructive",
        s === "pending" &&
          "border border-amber-600/30 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
        className
      )}
    >
      {status}
    </span>
  );
}
