import type { CouncilClearanceCandidate } from "./contracts";

export type NameParts = {
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  suffix?: string | null;
};

export function displayName(p: NameParts): string {
  return [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(" ") + (p.suffix ? `, ${p.suffix}` : "");
}

export const formatDisplayName = displayName;

export type RosterEntry = NameParts & {
  student_id: string;
  university_id: string;
  student_name?: string;
  year_level: number;
  academic_status: string;
};

export type ClearanceEntry = {
  student_id: string;
  confirmed_at: string;
  confirmed_by: string;
};

/**
 * Pure aggregation function for Council Clearance candidates (FL-040).
 * Combines semester roster with:
 * - Existing council clearance confirmations.
 * - Current & carryover financial payable summaries.
 * - Active council demerit counts.
 * - Anti-self-clearance flag for the currently active officer.
 */
export function buildCouncilClearanceCandidates({
  roster,
  clearances,
  financialSummaries,
  councilDemeritCounts,
  actorProfileId,
}: {
  roster: RosterEntry[];
  clearances: ClearanceEntry[];
  financialSummaries: Map<string, { totalOutstandingPayable: number }>;
  councilDemeritCounts: Map<string, number>;
  actorProfileId: string;
}): CouncilClearanceCandidate[] {
  const clearanceMap = new Map<string, ClearanceEntry>();
  for (const c of clearances) {
    clearanceMap.set(c.student_id, c);
  }

  return roster.map((student) => {
    const clearance = clearanceMap.get(student.student_id);
    const financial = financialSummaries.get(student.student_id);
    const demerits = councilDemeritCounts.get(student.student_id) ?? 0;
    const name = student.student_name ?? displayName(student);

    return {
      studentId: student.student_id,
      studentNumber: student.university_id,
      name,
      yearLevel: student.year_level,
      academicStatus: student.academic_status,
      totalOutstandingPayable: financial?.totalOutstandingPayable ?? 0,
      activeCouncilDemerits: demerits,
      isSelf: student.student_id === actorProfileId,
      status: {
        cleared: Boolean(clearance),
        confirmedAt: clearance?.confirmed_at ?? null,
        confirmedBy: clearance?.confirmed_by ?? null,
      },
    };
  });
}
