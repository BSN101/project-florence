import { RefreshButton } from "@/components/layout/refresh-button";
import { ShieldAlert } from "lucide-react";

import { Card } from "@/components/ui/card";
import { AttendanceQrCard } from "./attendance-qr-card";
import { StudentClearanceCard } from "./dashboard/student-clearance-card";
import { StudentDisciplinaryCard } from "./dashboard/student-disciplinary-card";
import { StudentFinancialCard } from "./dashboard/student-financial-card";
import { StudentUpcomingEventCard } from "./dashboard/student-upcoming-event-card";
import type { StudentDashboardData } from "../dashboard";

export function StudentHomeView({
  data,
  semesterId,
  renderedAt,
}: {
  data: StudentDashboardData;
  semesterId?: string;
  renderedAt?: string;
}) {
  const { student, qrDataUrl, qrError } = data;

  return (
    <div className="flex flex-col gap-6 sm:gap-8 max-w-5xl mx-auto w-full">
      {/* Welcome Banner & Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex flex-col gap-1 text-center sm:text-left min-w-0">
          <h2 className="section-title text-foreground">
            Welcome, {student.name}
          </h2>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Access your personal attendance QR code and review your semester records.
          </p>
        </div>
        {renderedAt && (
          <div className="self-center sm:self-auto shrink-0">
            <RefreshButton renderedAt={renderedAt} />
          </div>
        )}
      </div>

      {/* Attendance QR Section */}
      {!student.universityId ? (
        <Card className="flex flex-col items-center justify-center gap-3 p-8 text-center max-w-md mx-auto w-full">
          <ShieldAlert className="size-10 text-amber-500" />
          <h3 className="font-heading text-base font-semibold text-foreground">
            Student Number Required
          </h3>
          <p className="text-xs text-muted-foreground">
            Your profile does not currently have an assigned university student number. Please contact your Council Officer or Platform Administrator to establish your roster enrollment.
          </p>
        </Card>
      ) : qrError || !qrDataUrl ? (
        <Card role="alert" className="flex flex-col items-center justify-center gap-3 p-8 text-center max-w-md mx-auto w-full">
          <ShieldAlert className="size-10 text-destructive" />
          <p className="text-xs text-muted-foreground">
            {qrError ?? "Unable to display QR code."}
          </p>
        </Card>
      ) : (
        <AttendanceQrCard
          universityId={student.universityId}
          studentName={student.name}
          yearLevel={student.yearLevel}
          academicStatus={student.academicStatus}
          qrDataUrl={qrDataUrl}
        />
      )}

      {/* Permitted Records & Quick Actions Overview */}
      <div className="flex flex-col gap-3 sm:gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-sm font-semibold text-foreground">
            Academic & Financial Overview
          </h3>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            Tap a card for complete details
          </span>
        </div>

        {/* 1-to-2 column responsive grid (1 column on mobile & portrait tablets, 2 columns on lg+) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
          <StudentFinancialCard
            summary={data.finance.summary}
            error={data.finance.error}
            semesterId={semesterId}
          />
          <StudentDisciplinaryCard
            summary={data.discipline.summary}
            error={data.discipline.error}
            semesterId={semesterId}
          />
          <StudentClearanceCard
            summary={data.clearance.summary}
            error={data.clearance.error}
            semesterId={semesterId}
          />
          <StudentUpcomingEventCard
            highlight={data.events.highlight}
            totalUpcoming={data.events.totalUpcoming}
            error={data.events.error}
            semesterId={semesterId}
          />
        </div>
      </div>
    </div>
  );
}
