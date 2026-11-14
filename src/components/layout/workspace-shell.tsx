import { notFound, redirect } from "next/navigation";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { Workspace } from "@/features/access/access-policy";
import { destinationHref, getWorkspaceNavigation, hasMobileTabBar, workspaceLabels } from "@/features/access/workspace-navigation";
import { SemesterContext } from "@/features/semesters/components/semester-context";
import { SemesterFilter } from "@/features/semesters/components/semester-filter";
import { getUnreadNotificationCount } from "@/features/notifications/queries";
import { semesterFilterSchema } from "@/features/semesters/schemas";
import { getAccessContext } from "@/server/auth/access-context";
import { AppSidebar } from "./app-sidebar";
import { WorkspaceHeader } from "./workspace-header";

/** Starts the shell's own queries early; call it before a page's data work so they overlap. */
export function preloadWorkspaceShell(workspace: Workspace) {
  if (workspace === "student") void getUnreadNotificationCount().catch(() => 0);
}

export async function WorkspaceShell({ workspace, destination = "", semester, children }: {
  workspace: Workspace;
  destination?: string;
  semester?: string | string[];
  children?: React.ReactNode;
}) {
  const access = await getAccessContext();
  if (access.status === "unauthenticated") redirect(`/sign-in?next=/${workspace}`);
  if (access.status === "error") throw new Error("Unable to verify Florence access. Try again later.");
  if (access.status === "unavailable") redirect("/access-unavailable");
  if (!access.workspaces.includes(workspace)) notFound();

  const navigation = getWorkspaceNavigation(workspace, access);
  if (destination === "" && !navigation.some((item) => item.slug === "")) {
    redirect(destinationHref(workspace, navigation[0].slug));
  }
  if (!navigation.some((item) => item.slug === destination)) notFound();

  const currentItem = navigation.find((item) => item.slug === destination)!;
  const tabBar = hasMobileTabBar(navigation);
  const visibleSemesters = workspace === "student"
    ? access.semesters.filter((item) => access.enrollments.some((enrollment) => enrollment.semester_id === item.id))
    : access.semesters;
  const parsedFilter = semesterFilterSchema.safeParse(currentItem.semesterScoped ? { semester } : {});
  if (!parsedFilter.success) notFound();
  if (parsedFilter.data.semester && !visibleSemesters.some((item) => item.id === parsedFilter.data.semester)) notFound();
  const selectedSemester = parsedFilter.data.semester
    ?? visibleSemesters.find((item) => item.is_current)?.id
    ?? visibleSemesters[0]?.id;

  const unreadNotifications = workspace === "student"
    ? await getUnreadNotificationCount().catch(() => 0)
    : 0;

  return (
    <SidebarProvider>
      <AppSidebar
        workspace={workspace}
        navigation={navigation}
        currentSlug={destination}
        access={access}
        unreadNotifications={unreadNotifications}
      />
      <SidebarInset className="min-w-0">
        <WorkspaceHeader
          title={currentItem.label}
          workspace={workspace}
          unreadNotifications={unreadNotifications}
          access={access}
          tabBar={tabBar}
        />
        <div className={`min-w-0 flex-1 px-4 py-5 sm:px-8 sm:py-8 lg:px-10 ${tabBar ? "max-md:pb-[calc(5rem+env(safe-area-inset-bottom))]" : ""}`}>
          <div className="mx-auto flex max-w-5xl flex-col gap-6 sm:gap-8">
            <section className="flex flex-col gap-3 sm:gap-5">
              <div>
                <p className="hidden text-sm font-medium text-muted-foreground md:block">{workspaceLabels[workspace]} workspace</p>
                <h1 id="page-title" className="page-title">{currentItem.label}</h1>
              </div>
              <SemesterContext semester={access.currentSemester} profile={access.profile} enrollments={access.enrollments} />
            </section>
            <section className="flex flex-col gap-6">
              {currentItem.semesterScoped && selectedSemester &&
                <SemesterFilter
                  semesters={visibleSemesters}
                  selectedId={selectedSemester}
                  enrollmentLimited={workspace === "student"}
                />}
              {currentItem.semesterScoped && !selectedSemester &&
                <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">No semester is available for this page.</p>}
              {children ?? <p className="text-muted-foreground">This is the {currentItem.label} page.</p>}
            </section>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
