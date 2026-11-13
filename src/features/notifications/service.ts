import "server-only";

import { requireWorkspace } from "@/server/auth/require-workspace";
import { createCommandClient } from "@/server/db/command-client";
import type { CreateNotificationInput, NotificationKind } from "./contracts";
import { createNotificationInputSchema, notificationIdSchema } from "./schemas";

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

/**
 * Server-only helper to insert a notification using the service-role client.
 * Called by modules (fees, merits, payments, etc.).
 */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const parsed = createNotificationInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid notification data" };
  }

  const client = createCommandClient();
  const { data, error } = await client
    .from("notifications")
    .insert({
      recipient_id: parsed.data.recipientId,
      kind: parsed.data.kind,
      message: parsed.data.message,
      target_type: null,
      target_id: null,
    })
    .select("id")
    .single();

  if (error) {
    return { success: false, error: `Failed to create notification: ${error.message}` };
  }

  return { success: true, id: data.id };
}

/**
 * Server-only helper to insert notifications in a single batch.
 */
export async function createBulkNotifications(
  inputs: CreateNotificationInput[],
): Promise<{ success: boolean; count: number; error?: string }> {
  if (inputs.length === 0) return { success: true, count: 0 };

  const validRows = [];
  for (const item of inputs) {
    const parsed = createNotificationInputSchema.safeParse(item);
    if (!parsed.success) {
      return { success: false, count: 0, error: parsed.error.issues[0]?.message ?? "Invalid notification in batch" };
    }
    validRows.push({
      recipient_id: parsed.data.recipientId,
      kind: parsed.data.kind,
      message: parsed.data.message,
      target_type: null,
      target_id: null,
    });
  }

  const client = createCommandClient();
  const { data, error } = await client
    .from("notifications")
    .insert(validRows)
    .select("id");

  if (error) {
    return { success: false, count: 0, error: `Failed to create bulk notifications: ${error.message}` };
  }

  return { success: true, count: data?.length ?? 0 };
}

/**
 * Clean, standard notification dispatcher for feature modules to invoke.
 * (e.g. Andrei in T-041 or Reipoh in T-033).
 */
export async function notifyStudent(
  recipientId: string,
  kind: NotificationKind,
  message: string,
  targetId?: string,
): Promise<{ success: boolean; id?: string; error?: string }> {
  return createNotification({
    recipientId,
    kind,
    message,
    targetId: targetId ?? null,
  });
}
