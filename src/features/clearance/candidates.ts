import type {
  CouncilClearanceCandidate,
  FacultyClearanceCandidate,
  FacultyClearanceComponent,
} from "./contracts";

export type RosterEntry = {
  student_id: string;
  university_id: string;
  /** Already formatted by the caller (`displayName`), so this module has no runtime imports for `node --test`. */
  name: string;
  year_level: number;
  academic_status: string;
};

export type ClearanceEntry = {
  student_id: string;
  confirmed_at: string;
  confirmed_by: string;
};

export type StudentDisciplineMetrics = {
  activeDemerits: number;
  appliedMerits: number;
  serviceCredits: number;
  netBalance: number;
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

    return {
      studentId: student.student_id,
      studentNumber: student.university_id,
      name: student.name,
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

/**
 * Pure aggregation function for Faculty Clearance candidates (FL-041).
 * Combines semester roster with:
 * - Prerequisite Council clearance confirmations for the same student & semester.
 * - Existing Faculty clearance confirmations for the given component ('academic' | 'rle').
 * - Cumulative disciplinary balances for the specific bucket ('office' | 'rle').
 * - Anti-self-clearance flag for the currently active coordinator.
 */
export function buildFacultyClearanceCandidates({
  roster,
  councilClearances,
  facultyClearances,
  disciplineMap,
  actorProfileId,
  component,
  bucket,
}: {
  roster: RosterEntry[];
  councilClearances: ClearanceEntry[];
  facultyClearances: ClearanceEntry[];
  disciplineMap: Map<string, StudentDisciplineMetrics>;
  actorProfileId: string;
  component: FacultyClearanceComponent;
  bucket: "office" | "rle";
}): FacultyClearanceCandidate[] {
  const councilMap = new Map<string, ClearanceEntry>();
  for (const c of councilClearances) {
    councilMap.set(c.student_id, c);
  }

  const facultyMap = new Map<string, ClearanceEntry>();
  for (const f of facultyClearances) {
    facultyMap.set(f.student_id, f);
  }

  return roster.map((student) => {
    const councilClearance = councilMap.get(student.student_id);
    const facultyClearance = facultyMap.get(student.student_id);
    const discipline = disciplineMap.get(student.student_id) ?? {
      activeDemerits: 0,
      appliedMerits: 0,
      serviceCredits: 0,
      netBalance: 0,
    };

    return {
      studentId: student.student_id,
      studentNumber: student.university_id,
      name: student.name,
      yearLevel: student.year_level,
      academicStatus: student.academic_status,
      councilCleared: Boolean(councilClearance),
      councilConfirmedAt: councilClearance?.confirmed_at ?? null,
      bucket,
      activeDemerits: discipline.activeDemerits,
      appliedMerits: discipline.appliedMerits,
      serviceCredits: discipline.serviceCredits,
      netBalance: discipline.netBalance,
      isSelf: student.student_id === actorProfileId,
      status: {
        cleared: Boolean(facultyClearance),
        confirmedAt: facultyClearance?.confirmed_at ?? null,
        confirmedBy: facultyClearance?.confirmed_by ?? null,
      },
    };
  });
}

