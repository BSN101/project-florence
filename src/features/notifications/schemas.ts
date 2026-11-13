import { z } from "zod";

export const NOTIFICATION_KINDS = [
  "merit_received",
  "demerit_incurred",
  "service_recorded",
  "obligation_due",
  "payment_verified",
  "payment_rejected",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const notificationIdSchema = z.string().uuid("Invalid notification identifier");

export const notificationKindSchema = z.enum(NOTIFICATION_KINDS, {
  message: "Invalid notification kind",
});

export const createNotificationInputSchema = z.object({
  recipientId: z.string().uuid("Invalid recipient identifier"),
  kind: z.string().trim().min(1, "Kind is required"),
  message: z.string().trim().min(1, "Notification message cannot be empty"),
  targetId: z.string().uuid().optional().nullable(),
});

export const getNotificationsFilterSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
  filter: z.enum(["all", "unread"]).default("all"),
});
