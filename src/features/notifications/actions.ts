"use server";

import { revalidatePath } from "next/cache";
import { AccessDeniedError } from "@/server/auth/require-workspace";
import { markAllNotificationsAsRead, markNotificationAsRead } from "./service";

export async function markNotificationAsReadAction(
  notificationId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await markNotificationAsRead(notificationId);
    if (result.success) {
      revalidatePath("/student/notifications");
    }
    return result;
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return { success: false, error: "You are not authorized to perform this action." };
    }
    return { success: false, error: "Failed to update notification." };
  }
}

export async function markAllNotificationsAsReadAction(): Promise<{
  success: boolean;
  count?: number;
  error?: string;
}> {
  try {
    const result = await markAllNotificationsAsRead();
    if (result.success) {
      revalidatePath("/student/notifications");
    }
    return result;
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return { success: false, error: "You are not authorized to perform this action." };
    }
    return { success: false, error: "Failed to mark all notifications as read." };
  }
}
