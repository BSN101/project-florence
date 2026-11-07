import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { signOut } from "@/app/(auth)/sign-out/action";
import { getAccessContext } from "@/server/auth/access-context";
import type { Workspace } from "@/features/access/access-policy";

const labels: Record<Workspace, string> = {
  student: "Student",
  council: "Council",
  faculty: "Faculty",
  admin: "Platform administration",
};

export async function WorkspaceShell({ workspace, children }: {
  workspace: Workspace;
  children: React.ReactNode;
}) {
  const access = await getAccessContext();
  if (access.status === "unauthenticated") redirect(`/sign-in?next=/${workspace}`);
  if (access.status === "error") throw new Error("Unable to verify Florence access. Try again later.");
  if (access.status === "unavailable") redirect("/access-unavailable");
  if (!access.workspaces.includes(workspace)) notFound();

  const fullName = `${access.profile.first_name} ${access.profile.last_name}`;
  const currentEnrollment = access.enrollments.find((item) => item.semester_id === access.currentSemester?.id);
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-10 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <Link href="/" className="font-heading font-semibold text-primary">Project Florence</Link>
        <div className="flex items-center gap-5"><Link href="/reset-password" className="font-medium text-primary underline underline-offset-4">Change password</Link><form action={signOut}><button type="submit" className="font-medium text-primary underline underline-offset-4">Sign out</button></form></div>
      </header>
      <nav aria-label="Workspaces" className="flex flex-wrap gap-3">
        {access.workspaces.map((item) => <Link key={item} href={`/${item}`} aria-current={item === workspace ? "page" : undefined}
          className={`rounded-lg border px-4 py-2 font-medium ${item === workspace ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary"}`}>{labels[item]}</Link>)}
      </nav>
      <section>
        <p className="text-sm text-muted-foreground">Signed in as {fullName}</p>
        <h1 className="page-title">{labels[workspace]} workspace</h1>
        <div className="mt-4 text-sm text-muted-foreground">
          {access.profile.university_id && <p>University number: {access.profile.university_id}</p>}
          {access.roles.length > 0 && <p>Assignments: {access.roles.join(", ")}</p>}
          {access.councilRole && <p>Council role: {access.councilRole}</p>}
          {access.currentSemester
            ? <p>Current semester: {access.currentSemester.academic_year_start} · {access.currentSemester.term}{access.profile.university_id && !currentEnrollment ? " (you are not enrolled in this context)" : ""}</p>
            : <p>No current semester is configured. Semester-dependent actions are unavailable.</p>}
        </div>
      </section>
      {children}
    </main>
  );
}
