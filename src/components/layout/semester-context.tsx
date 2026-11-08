import { CalendarClock, TriangleAlert } from "lucide-react";

import type { AccessEnrollment, AccessProfile, CurrentSemester } from "@/features/access/access-policy";

export function SemesterContext({ semester, profile, enrollments }: {
  semester: CurrentSemester | null;
  profile: AccessProfile;
  enrollments: AccessEnrollment[];
}) {
  const enrolled = semester && enrollments.some((item) => item.semester_id === semester.id);
  return (
    <div className={`flex items-start gap-2 text-sm ${semester ? "text-muted-foreground" : "rounded-lg bg-warning px-3 py-2 text-warning-foreground"}`}>
      {semester ? <CalendarClock className="mt-0.5 size-4 shrink-0" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0" />}
      <p>{semester
        ? <>Institutionally current: <span className="font-medium text-foreground">{semester.academic_year_start} · {semester.term}</span>{profile.university_id && !enrolled ? " · You are not enrolled in this context" : ""}</>
        : <><span className="font-medium">Current semester unavailable.</span> Semester-dependent actions cannot be used right now.</>}</p>
    </div>
  );
}
