import { notFound, redirect } from "next/navigation";

import type { Workspace } from "@/features/access/access-policy";
import { destinationHref, getWorkspaceNavigation, hasMobileTabBar, isFocusedWorkspace, workspaceLabels } from "@/features/access/workspace-navigation";
import { SemesterContext } from "@/features/semesters/components/semester-context";
import { SemesterFilter } from "@/features/semesters/components/semester-filter";
import { resolveSelectedSemester } from "@/features/semesters/schemas";
import { getAccessContext } from "@/server/auth/access-context";
import { PageTransition } from "./page-transition";
import { ScrollEdge } from "./scroll-edge";

/**
 * Page frame and access gate: redirects or 404s for the workspace, destination and semester, then
 * renders the page title, semester controls and content. The sidebar, header and tab bar live in the
 * workspace layout (WorkspaceChrome) so they stay mounted between pages.
 */
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
  const focused = isFocusedWorkspace(navigation);
  const visibleSemesters = workspace === "student"
    ? access.semesters.filter((item) => access.enrollments.some((enrollment) => enrollment.semester_id === item.id))
    : access.semesters;
  const resolved = resolveSelectedSemester(visibleSemesters, currentItem.semesterScoped ? semester : undefined);
  if (resolved === null) notFound();
  const selectedSemester = resolved?.id;

  return (
    <PageTransition>
      <div data-workspace-shell-frame className={`min-w-0 flex-1 px-4 py-5 sm:px-8 sm:py-8 lg:px-10 ${tabBar ? "max-md:pb-[calc(6rem+env(safe-area-inset-bottom))]" : ""}`}>
        <div className={`mx-auto flex flex-col gap-6 sm:gap-8 ${focused ? "max-w-2xl" : "max-w-5xl"}`}>
          <section data-workspace-shell-header className="flex flex-col gap-3 sm:gap-5">
            <div>
              <p className="hidden text-sm font-medium text-muted-foreground md:block">{workspaceLabels[workspace]} workspace</p>
              <ScrollEdge><h1 id="page-title" className="page-title">{currentItem.label}</h1></ScrollEdge>
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
    </PageTransition>
  );
}
