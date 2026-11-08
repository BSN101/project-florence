import { notFound, redirect } from "next/navigation";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { Workspace } from "@/features/access/access-policy";
import { destinationHref, getWorkspaceNavigation, workspaceLabels } from "@/features/access/workspace-navigation";
import { SemesterFilter } from "@/features/semesters/semester-filter";
import { semesterFilterSchema } from "@/features/semesters/semester-filter-schema";
import { getAccessContext } from "@/server/auth/access-context";
import { AppSidebar } from "./app-sidebar";
import { SemesterContext } from "./semester-context";
import { WorkspaceHeader } from "./workspace-header";

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
  const visibleSemesters = workspace === "student"
    ? access.semesters.filter((item) => access.enrollments.some((enrollment) => enrollment.semester_id === item.id))
    : access.semesters;
  const parsedFilter = semesterFilterSchema.safeParse(currentItem.semesterScoped ? { semester } : {});
  if (!parsedFilter.success) notFound();
  if (parsedFilter.data.semester && !visibleSemesters.some((item) => item.id === parsedFilter.data.semester)) notFound();
  const selectedSemester = parsedFilter.data.semester
    ?? visibleSemesters.find((item) => item.is_current)?.id
    ?? visibleSemesters[0]?.id;

  return (
    <SidebarProvider>
      <AppSidebar workspace={workspace} navigation={navigation} currentSlug={destination} access={access} />
      <SidebarInset>
        <WorkspaceHeader title={currentItem.label} />
        <div className="min-w-0 flex-1 px-5 py-8 sm:px-8 lg:px-10">
          <div className="mx-auto flex max-w-5xl flex-col gap-8">
            <section className="flex flex-col gap-5">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{workspaceLabels[workspace]} workspace</p>
                <h1 className="page-title">{currentItem.label}</h1>
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
