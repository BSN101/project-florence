import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  HeartHandshake,
  Receipt,
  Shield,
  XCircle,
} from "lucide-react";

export const NOTIFICATION_KINDS = [
  "merit_received",
  "demerit_incurred",
  "service_recorded",
  "obligation_due",
  "payment_verified",
  "payment_rejected",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type NotificationDTO = {
  id: string;
  recipient_id: string;
  kind: string;
  message: string;
  target_type: string | null;
  target_id: string | null;
  read_at: string | null;
  created_at: string;
};

export type NotificationConfigItem = {
  label: string;
  category: "merit" | "demerit" | "service" | "finance" | "access" | "general";
  icon: LucideIcon;
  href: string;
  badgeClass: string;
  iconClass: string;
};

export const NOTIFICATION_CONFIG: Record<NotificationKind, NotificationConfigItem> = {
  merit_received: {
    label: "Merit Endorsed",
    category: "merit",
    icon: Award,
    href: "/student/merits-demerits-and-services",
    badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    iconClass: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
  },
  demerit_incurred: {
    label: "Demerit Incurred",
    category: "demerit",
    icon: AlertTriangle,
    href: "/student/merits-demerits-and-services",
    badgeClass: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
    iconClass: "text-rose-600 dark:text-rose-400 bg-rose-500/10",
  },
  service_recorded: {
    label: "Service Recorded",
    category: "service",
    icon: HeartHandshake,
    href: "/student/merits-demerits-and-services",
    badgeClass: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20",
    iconClass: "text-sky-600 dark:text-sky-400 bg-sky-500/10",
  },
  obligation_due: {
    label: "Payment Due",
    category: "finance",
    icon: Receipt,
    href: "/student/fees-and-fines",
    badgeClass: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
    iconClass: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
  },
  payment_verified: {
    label: "Payment Verified",
    category: "finance",
    icon: CheckCircle2,
    href: "/student/fees-and-fines",
    badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    iconClass: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
  },
  payment_rejected: {
    label: "Payment Rejected",
    category: "finance",
    icon: XCircle,
    href: "/student/fees-and-fines",
    badgeClass: "bg-destructive/10 text-destructive border-destructive/20",
    iconClass: "text-destructive bg-destructive/10",
  },
};

const DEFAULT_NOTIFICATION_CONFIG: NotificationConfigItem = {
  label: "Council Notice",
  category: "access",
  icon: Shield,
  href: "/student",
  badgeClass: "bg-primary/10 text-primary border-primary/20",
  iconClass: "text-primary bg-primary/10",
};

export function getNotificationMeta(kind: string): NotificationConfigItem {
  if (kind === "council_access_changed") {
    return {
      label: "Council Access Updated",
      category: "access",
      icon: Shield,
      href: "/council",
      badgeClass: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
      iconClass: "text-purple-600 dark:text-purple-400 bg-purple-500/10",
    };
  }
  return (NOTIFICATION_CONFIG as Record<string, NotificationConfigItem>)[kind] ?? DEFAULT_NOTIFICATION_CONFIG;
}

export type CreateNotificationInput = {
  recipientId: string;
  kind: NotificationKind | string;
  message: string;
  targetId?: string | null;
};
