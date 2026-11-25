import type { StudentFinancialSummaryDTO } from "@/features/finance/contracts";
import type { StudentDisciplinarySummary } from "@/features/discipline/contracts";
import type { StudentClearanceSummary } from "@/features/clearance/contracts";
import type { UpcomingEventHighlight } from "@/features/events/event-state";

/** A Home card's read: `failed` shows the card's error state, `data: null` its empty state. */
export type CardResult<T> = { data: T | null; failed: boolean };

export type StudentDashboardData = {
  student: {
    name: string;
    universityId: string;
    yearLevel?: number | null;
    academicStatus?: string | null;
  };
  qrDataUrl: string | null;
  qrError: string | null;
  // Streamed: each card reads its own promise behind <Suspense> so the QR renders at once.
  finance: Promise<CardResult<StudentFinancialSummaryDTO>>;
  discipline: Promise<CardResult<StudentDisciplinarySummary>>;
  clearance: Promise<CardResult<StudentClearanceSummary>>;
  events: Promise<CardResult<{ highlight: UpcomingEventHighlight | null; totalUpcoming: number }>>;
};

/** Settles a card's read without rejecting, logging the reason on the server. `null` means nothing to read. */
export function settleCard<T>(read: Promise<T> | null, label: string): Promise<CardResult<T>> {
  if (!read) return Promise.resolve({ data: null, failed: false });
  return read.then(
    (data) => ({ data, failed: false }),
    (error: unknown) => {
      console.error(`Student home: unable to load ${label}`, error);
      return { data: null, failed: true };
    },
  );
}

/**
 * Constructs a semester-scoped URL or falls back to the base path.
 */
export function buildSemesterHref(basePath: string, semesterId?: string): string {
  return semesterId
    ? `${basePath}?semester=${encodeURIComponent(semesterId)}`
    : basePath;
}

/**
 * Derives the student conduct badge status from authoritative outstanding debt.
 */
export function getDisciplinaryStatus(summary: { hasOutstandingDebt: boolean }): "Clean Record" | "Active Demerits" {
  return !summary.hasOutstandingDebt ? "Clean Record" : "Active Demerits";
}
