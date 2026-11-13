import { AlertCircle, Clock, Mail, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import type { StudentRosterItem } from "../contracts";

export interface InvitationStatusBadgeProps {
  student: Pick<StudentRosterItem, "has_account" | "invitation_state" | "email">;
  className?: string;
  size?: "sm" | "md";
}

export function InvitationStatusBadge({
  student,
  className,
  size = "md",
}: InvitationStatusBadgeProps) {
  const isSm = size === "sm";
  const baseClasses = cn(
    "inline-flex items-center gap-1.5 rounded-full font-semibold shrink-0",
    isSm ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-0.5 text-xs",
    className
  );

  if (student.has_account) {
    return (
      <span
        className={cn(
          baseClasses,
          "border border-emerald-600/30 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
        )}
      >
        <span className={cn("rounded-full bg-emerald-600 dark:bg-emerald-400", isSm ? "size-1.5" : "size-2")} />
        Account linked
      </span>
    );
  }

  if (student.invitation_state === "pending") {
    return (
      <span
        className={cn(
          baseClasses,
          "border border-sky-600/30 bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
        )}
      >
        <Clock className={isSm ? "size-3" : "size-3.5"} />
        Invitation pending
      </span>
    );
  }

  // The invitation is still valid; only the email is in doubt, so Council can reissue.
  if (student.invitation_state === "undelivered" || student.invitation_state === "unconfirmed") {
    return (
      <span
        className={cn(
          baseClasses,
          "border border-amber-600/30 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
        )}
      >
        <AlertCircle className={isSm ? "size-3" : "size-3.5"} />
        {student.invitation_state === "undelivered" ? "Email not delivered" : "Email unconfirmed"}
      </span>
    );
  }

  if (student.invitation_state === "expired") {
    return (
      <span
        className={cn(
          baseClasses,
          "border border-amber-600/30 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
        )}
      >
        <AlertCircle className={isSm ? "size-3" : "size-3.5"} />
        Invitation expired
      </span>
    );
  }

  if (student.invitation_state === "cancelled") {
    return (
      <span
        className={cn(
          baseClasses,
          "border border-rose-600/30 bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
        )}
      >
        <XCircle className={isSm ? "size-3" : "size-3.5"} />
        Invitation cancelled
      </span>
    );
  }

  if (!student.email || student.email.trim() === "") {
    return (
      <span
        className={cn(
          baseClasses,
          "border border-border bg-muted/60 text-muted-foreground"
        )}
      >
        <span className={cn("rounded-full bg-muted-foreground/60", isSm ? "size-1.5" : "size-2")} />
        No email
      </span>
    );
  }

  return (
    <span
      className={cn(
        baseClasses,
        "border border-border bg-muted/60 text-muted-foreground"
      )}
    >
      <Mail className={isSm ? "size-3" : "size-3.5"} />
      No invitation
    </span>
  );
}
