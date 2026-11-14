import "server-only";

import { cache } from "react";

import { requireWorkspace } from "@/server/auth/require-workspace";
import { createUserClient } from "@/server/db/user-client";
import type { NotificationDTO } from "./contracts";

const notificationFields =
  "id, recipient_id, kind, message, target_type, target_id, read_at, created_at";

/**
 * Fetches the newest notifications for the authenticated student.
 * RLS (`recipient_id = f_access_private.me()`) strictly isolates rows.
 */
export async function getStudentNotifications(limit: number): Promise<NotificationDTO[]> {
  await requireWorkspace("student");
  const client = await createUserClient();
  const { data, error } = await client
    .from("notifications")
    .select(notificationFields)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to fetch notifications: ${error.message}`);
  return data ?? [];
}

/**
 * Returns count of unread notifications for the active student.
 * Uses the partial index idx_notifications_unread (where read_at is null).
 * Memoized per request using React cache() to avoid duplicate DB counts across shell & page.
 */
export const getUnreadNotificationCount = cache(async function getUnreadNotificationCount(): Promise<number> {
  await requireWorkspace("student");
  const client = await createUserClient();
  const { count, error } = await client
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  if (error) throw new Error(`Failed to count unread notifications: ${error.message}`);
  return count ?? 0;
});
