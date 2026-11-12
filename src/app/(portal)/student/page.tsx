import Link from "next/link";
import {
  CalendarDays,
  CircleDollarSign,
  ClipboardCheck,
  Medal,
  ShieldAlert,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { AttendanceQrCard } from "@/features/students/components/attendance-qr-card";
import { generateAttendanceQrDataUrl } from "@/features/students/qr";
import { displayName } from "@/lib/format-name";
import { getAccessContext } from "@/server/auth/access-context";

export const instant = false;

export default async function StudentPage({
  searchParams,
}: {
  searchParams: Promise<{ semester?: string | string[] }>;
}) {
  const { semester } = await searchParams;
  const access = await getAccessContext();
  const ready = access.status === "ready" ? access : null;

  const profile = ready?.profile;
  const universityId = profile?.university_id;
  const studentName = profile ? displayName(profile) : "Student";

  // Find active or recent enrollment
  const currentEnrollment = ready?.enrollments.find(
    (e) => e.semester_id === ready.currentSemester?.id,
  ) ?? ready?.enrollments[0];

  let qrDataUrl: string | null = null;
  let qrError: string | null = null;

  if (universityId) {
    try {
      qrDataUrl = await generateAttendanceQrDataUrl(universityId);
    } catch {
      qrError = "Unable to generate attendance QR code. Please ensure your student number is formatted properly.";
    }
  }

  return (
    <WorkspaceShell workspace="student" destination="" semester={semester}>
      <div className="flex flex-col gap-8 max-w-4xl mx-auto w-full">
        {/* Welcome Banner */}
        <div className="flex flex-col gap-1 text-center sm:text-left">
          <h2 className="font-heading text-xl font-bold text-foreground sm:text-2xl">
            Welcome, {profile?.first_name ?? "Student"}
          </h2>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Access your personal attendance QR code and student academic tools.
          </p>
        </div>

        {/* QR Section */}
        {!universityId ? (
          <Card className="flex flex-col items-center justify-center gap-3 p-8 text-center max-w-md mx-auto">
            <ShieldAlert className="size-10 text-amber-500" />
            <h3 className="font-heading text-base font-semibold text-foreground">
              Student Number Required
            </h3>
            <p className="text-xs text-muted-foreground">
              Your profile does not currently have an assigned university student number. Please contact your Council Officer or Platform Administrator to establish your roster enrollment.
            </p>
          </Card>
        ) : qrError || !qrDataUrl ? (
          <Card role="alert" className="flex flex-col items-center justify-center gap-3 p-8 text-center max-w-md mx-auto">
            <ShieldAlert className="size-10 text-destructive" />
            <p className="text-xs text-muted-foreground">
              {qrError ?? "Unable to display QR code."}
            </p>
          </Card>
        ) : (
          <AttendanceQrCard
            universityId={universityId}
            studentName={studentName}
            yearLevel={currentEnrollment?.year_level}
            academicStatus={currentEnrollment?.academic_status}
            qrDataUrl={qrDataUrl}
          />
        )}

        {/* Quick Links */}
        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-sm font-semibold text-foreground">
            Student Quick Links
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
            <Link
              href="/student/events"
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/40 hover:border-primary/40 shadow-2xs"
            >
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <CalendarDays className="size-5" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-foreground">Events</span>
                <span className="text-[11px] text-muted-foreground truncate">Upcoming & attendance</span>
              </div>
            </Link>

            <Link
              href="/student/fees-and-fines"
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/40 hover:border-primary/40 shadow-2xs"
            >
              <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <CircleDollarSign className="size-5" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-foreground">Fees & Fines</span>
                <span className="text-[11px] text-muted-foreground truncate">Dues & payment history</span>
              </div>
            </Link>

            <Link
              href="/student/merits-demerits-and-services"
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/40 hover:border-primary/40 shadow-2xs"
            >
              <div className="flex size-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Medal className="size-5" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-foreground">Merits & Services</span>
                <span className="text-[11px] text-muted-foreground truncate">Office & RLE records</span>
              </div>
            </Link>

            <Link
              href="/student/clearance"
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/40 hover:border-primary/40 shadow-2xs"
            >
              <div className="flex size-9 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
                <ClipboardCheck className="size-5" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-foreground">Clearance</span>
                <span className="text-[11px] text-muted-foreground truncate">Semester sign-offs</span>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </WorkspaceShell>
  );
}
