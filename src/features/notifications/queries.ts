import "server-only";

import { cache } from "react";

import { requireWorkspace } from "@/server/auth/require-workspace";
import { createUserClient } from "@/server/db/user-client";
import type { NotificationDTO } from "./contracts";

const notificationFields =
  "id, recipient_id, kind, message, target_type, target_id, read_at, created_at";

/**
 * Fetches paginated notifications for the authenticated student.
 * RLS (`recipient_id = f_access_private.me()`) strictly isolates rows.
 */
export async function getStudentNotifications(options?: {
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
}): Promise<NotificationDTO[]> {
  await requireWorkspace("student");
  const limit = options?.limit ?? 25;
  const offset = options?.offset ?? 0;
  const unreadOnly = options?.unreadOnly ?? false;

  const client = await createUserClient();
  let query = client
    .from("notifications")
    .select(notificationFields)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (unreadOnly) {
    query = query.is("read_at", null);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch notifications: ${error.message}`);
  return (data as NotificationDTO[]) ?? [];
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
