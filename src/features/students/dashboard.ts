import type { StudentFinancialSummaryDTO } from "@/features/finance/contracts";
import type { StudentDisciplinarySummary } from "@/features/discipline/contracts";
import type { StudentClearanceSummary } from "@/features/clearance/contracts";
import type { MyEventRow } from "@/features/events/contracts";

export type UpcomingEventHighlight = {
  event: MyEventRow;
  isOngoing: boolean;
};

export type StudentDashboardData = {
  student: {
    name: string;
    universityId: string;
    yearLevel?: number | null;
    academicStatus?: string | null;
  };
  qrDataUrl: string | null;
  qrError: string | null;
  finance: {
    summary: StudentFinancialSummaryDTO | null;
    error: string | null;
  };
  discipline: {
    summary: StudentDisciplinarySummary | null;
    error: string | null;
  };
  clearance: {
    summary: StudentClearanceSummary | null;
    error: string | null;
  };
  events: {
    highlight: UpcomingEventHighlight | null;
    totalUpcoming: number;
    error: string | null;
  };
};

/**
 * Pure function to identify the primary upcoming or ongoing event for the student home dashboard.
 * Ongoing events take visual precedence; otherwise, the earliest upcoming event is highlighted.
 */
export function findNextUpcomingEvent(
  events: MyEventRow[],
  nowIso: string
): {
  highlight: UpcomingEventHighlight | null;
  totalUpcoming: number;
} {
  const now = Date.parse(nowIso);
  if (isNaN(now)) {
    return { highlight: null, totalUpcoming: 0 };
  }

  const ongoing: MyEventRow[] = [];
  const upcoming: MyEventRow[] = [];

  for (const e of events) {
    if (!e.time_in_from) continue;
    const timeInFrom = Date.parse(e.time_in_from);
    if (isNaN(timeInFrom)) continue;

    if (now < timeInFrom) {
      upcoming.push(e);
    } else {
      const feedbackOpens = e.feedback_opens_at ? Date.parse(e.feedback_opens_at) : NaN;
      const isStillOngoing =
        !e.attendance_locked_at && !isNaN(feedbackOpens) && now < feedbackOpens;
      if (isStillOngoing) {
        ongoing.push(e);
      }
    }
  }

  // Sort chronologically ascending
  upcoming.sort((a, b) => Date.parse(a.time_in_from) - Date.parse(b.time_in_from));
  ongoing.sort((a, b) => Date.parse(a.time_in_from) - Date.parse(b.time_in_from));

  const totalUpcoming = ongoing.length + upcoming.length;

  if (ongoing.length > 0) {
    return {
      highlight: { event: ongoing[0], isOngoing: true },
      totalUpcoming,
    };
  }

  if (upcoming.length > 0) {
    return {
      highlight: { event: upcoming[0], isOngoing: false },
      totalUpcoming,
    };
  }

  return { highlight: null, totalUpcoming: 0 };
}
