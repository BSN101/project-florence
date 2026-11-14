import "server-only";

import { requireWorkspace } from "@/server/auth/require-workspace";
import { createCommandClient } from "@/server/db/command-client";
import { notificationIdSchema } from "./schemas";

// Notices are created inside the owning database command (f_cmd_notice), in the
// same transaction as the business write; this module only lets recipients mark them read.

/**
 * Marks a single notification as read for the authenticated student.
 * Enforces that recipient_id strictly matches the session profile ID.
 */
export async function markNotificationAsRead(rawId: string): Promise<{ success: boolean; error?: string }> {
  const context = await requireWorkspace("student");
  const parsed = notificationIdSchema.safeParse(rawId);
  if (!parsed.success) {
    return { success: false, error: "Invalid notification ID" };
  }

  const client = createCommandClient();
  const now = new Date().toISOString();

  // Scoped strictly to session student profile and only unread rows
  const { error } = await client
    .from("notifications")
    .update({ read_at: now })
    .eq("id", parsed.data)
    .eq("recipient_id", context.profile.id)
    .is("read_at", null);

  if (error) {
    return { success: false, error: "Failed to mark notification as read" };
  }

  return { success: true };
}

/**
 * Marks all unread notifications as read for the authenticated student.
 */
export async function markAllNotificationsAsRead(): Promise<{ success: boolean; count: number; error?: string }> {
  const context = await requireWorkspace("student");
  const client = createCommandClient();
  const now = new Date().toISOString();

  const { data, error } = await client
    .from("notifications")
    .update({ read_at: now })
    .eq("recipient_id", context.profile.id)
    .is("read_at", null)
    .select("id");

  if (error) {
    return { success: false, count: 0, error: "Failed to mark notifications as read" };
  }

  return { success: true, count: data?.length ?? 0 };
}
