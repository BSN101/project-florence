import { connection } from "next/server";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { NotificationList } from "@/features/notifications/components/notification-list";
import { getStudentNotifications, getUnreadNotificationCount } from "@/features/notifications/queries";
import { getAccessContext } from "@/server/auth/access-context";

export const instant = false;

export default async function StudentNotificationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ semester?: string | string[] }>;
}) {
  await connection();
  const { semester } = (await searchParams) ?? {};
  const access = await getAccessContext();

  if (access.status !== "ready" || !access.workspaces.includes("student")) {
    return <WorkspaceShell workspace="student" destination="notifications" semester={semester} />;
  }

  const [notifications, unreadCount] = await Promise.all([
    getStudentNotifications({ limit: 50 }),
    getUnreadNotificationCount(),
  ]);

  return (
    <WorkspaceShell workspace="student" destination="notifications" semester={semester}>
      <NotificationList
        initialNotifications={notifications}
        initialUnreadCount={unreadCount}
      />
    </WorkspaceShell>
  );
}
