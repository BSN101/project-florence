import { workspaceLabels } from "@/features/access/workspace-navigation";
import type { AccessContext } from "@/server/auth/access-context";

function fullName(profile: Extract<AccessContext, { status: "ready" }>["profile"]) {
  return [profile.first_name, profile.middle_name, profile.last_name, profile.suffix].filter(Boolean).join(" ");
}

function councilRoleLabel(role: NonNullable<Extract<AccessContext, { status: "ready" }>["councilRole"]>) {
  return `Council ${role[0].toUpperCase()}${role.slice(1)}`;
}

export function AccountDetails({ access }: { access: Extract<AccessContext, { status: "ready" }> }) {
  const semesterById = new Map(access.semesters.map((semester) => [semester.id, semester]));
  const roleLabels = [
    ...(access.workspaces.includes("student") ? ["Student"] : []),
    ...(access.councilRole ? [councilRoleLabel(access.councilRole)] : []),
    ...access.roles,
  ];

  return (
    <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <h2 className="section-title">Personal information</h2>
      <p className="mt-2 text-muted-foreground">These protected identity fields are read-only.</p>
      <dl className="mt-6 grid gap-5 sm:grid-cols-2">
        <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Full name</dt><dd className="mt-1 font-medium">{fullName(access.profile)}</dd></div>
        <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</dt><dd className="mt-1 font-medium">{access.email ?? "Not available"}</dd></div>
        {access.profile.university_id && <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">University ID</dt><dd className="mt-1 font-medium">{access.profile.university_id}</dd></div>}
        <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Available workspaces</dt><dd className="mt-1 font-medium">{access.workspaces.map((workspace) => workspaceLabels[workspace]).join(", ")}</dd></div>
        <div className="sm:col-span-2"><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Roles</dt><dd className="mt-1 font-medium">{roleLabels.join(", ")}</dd></div>
        {access.enrollments.length > 0 && <div className="sm:col-span-2">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Student semester enrollment</dt>
          <dd className="mt-2 space-y-2">
            {access.enrollments.map((enrollment) => {
              const semester = semesterById.get(enrollment.semester_id);
              return <p key={enrollment.semester_id} className="rounded-lg border border-border bg-background px-3 py-2">
                {semester ? `${semester.academic_year_start} · ${semester.term}` : "Semester unavailable"} · Year {enrollment.year_level} · {enrollment.academic_status}
              </p>;
            })}
          </dd>
        </div>}
      </dl>
    </section>
  );
}
