import type {
  CouncilClearanceCandidate,
  FacultyClearanceCandidate,
  FacultyClearanceComponent,
  StudentClearanceSummary,
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
  confirmed_by_name?: string | null;
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
 * Pure aggregation function for Faculty Clearance candidates (FL-041 / FL-042).
 * Combines semester roster with:
 * - Prerequisite Council clearance confirmations for the same student & semester.
 * - Both Academic and RLE faculty clearances for complete transparency across components.
 * - Cumulative disciplinary balances for the specific bucket ('office' | 'rle').
 * - Formatted confirming officer name for administrative traceability.
 * - Anti-self-clearance flag for the currently active coordinator.
 */
export function buildFacultyClearanceCandidates({
  roster,
  councilClearances,
  academicClearances,
  rleClearances,
  disciplineMap,
  actorProfileId,
  component,
  bucket,
}: {
  roster: RosterEntry[];
  councilClearances: ClearanceEntry[];
  academicClearances: ClearanceEntry[];
  rleClearances: ClearanceEntry[];
  disciplineMap: Map<string, StudentDisciplineMetrics>;
  actorProfileId: string;
  component: FacultyClearanceComponent;
  bucket: "office" | "rle";
}): FacultyClearanceCandidate[] {
  const councilMap = new Map<string, ClearanceEntry>();
  for (const c of councilClearances) {
    councilMap.set(c.student_id, c);
  }

  const academicMap = new Map<string, ClearanceEntry>();
  for (const a of academicClearances) {
    academicMap.set(a.student_id, a);
  }

  const rleMap = new Map<string, ClearanceEntry>();
  for (const r of rleClearances) {
    rleMap.set(r.student_id, r);
  }

  return roster.map((student) => {
    const councilClearance = councilMap.get(student.student_id);
    const academicClearance = academicMap.get(student.student_id);
    const rleClearance = rleMap.get(student.student_id);
    const currentFacultyClearance = component === "academic" ? academicClearance : rleClearance;
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
        cleared: Boolean(currentFacultyClearance),
        confirmedAt: currentFacultyClearance?.confirmed_at ?? null,
        confirmedBy: currentFacultyClearance?.confirmed_by ?? null,
        confirmedByName: currentFacultyClearance?.confirmed_by_name ?? null,
      },
      academicClearance: {
        cleared: Boolean(academicClearance),
        confirmedAt: academicClearance?.confirmed_at ?? null,
        confirmedBy: academicClearance?.confirmed_by ?? null,
        confirmedByName: academicClearance?.confirmed_by_name ?? null,
      },
      rleClearance: {
        cleared: Boolean(rleClearance),
        confirmedAt: rleClearance?.confirmed_at ?? null,
        confirmedBy: rleClearance?.confirmed_by ?? null,
        confirmedByName: rleClearance?.confirmed_by_name ?? null,
      },
    };
  });
}

export type RawStudentClearanceEntry = {
  component: "council" | "academic" | "rle" | string;
  confirmed_at: string;
  confirmed_by: string;
  confirmed_by_name?: string | null;
};

export type BuildStudentClearanceSummaryParams = {
  studentId: string;
  semesterId: string;
  semesterName: string;
  isEnrolled: boolean;
  isCurrentSemester: boolean;
  clearances: RawStudentClearanceEntry[];
};

/**
 * Pure aggregation function for Student Clearance Summary (FL-042).
 * Aggregates Council, Academic, and RLE clearances into an authoritative,
 * immutable status summary for the student workspace.
 */
export function buildStudentClearanceSummary({
  studentId,
  semesterId,
  semesterName,
  isEnrolled,
  isCurrentSemester,
  clearances,
}: BuildStudentClearanceSummaryParams): StudentClearanceSummary {
  const clearanceMap = new Map<string, RawStudentClearanceEntry>();
  for (const c of clearances) {
    clearanceMap.set(c.component, c);
  }

  const council = clearanceMap.get("council");
  const academic = clearanceMap.get("academic");
  const rle = clearanceMap.get("rle");

  const councilCleared = isEnrolled && Boolean(council);
  const academicCleared = isEnrolled && Boolean(academic);
  const rleCleared = isEnrolled && Boolean(rle);

  const isFullyCleared = councilCleared && academicCleared && rleCleared;

  return {
    studentId,
    semesterId,
    semesterName,
    isEnrolled,
    isCurrentSemester,
    isFullyCleared,
    components: {
      council: {
        component: "council",
        label: "Council Clearance",
        cleared: councilCleared,
        confirmedAt: isEnrolled ? council?.confirmed_at ?? null : null,
        confirmedByName: isEnrolled ? council?.confirmed_by_name ?? null : null,
      },
      academic: {
        component: "academic",
        label: "Academic Clearance",
        cleared: academicCleared,
        confirmedAt: isEnrolled ? academic?.confirmed_at ?? null : null,
        confirmedByName: isEnrolled ? academic?.confirmed_by_name ?? null : null,
      },
      rle: {
        component: "rle",
        label: "RLE Clearance",
        cleared: rleCleared,
        confirmedAt: isEnrolled ? rle?.confirmed_at ?? null : null,
        confirmedByName: isEnrolled ? rle?.confirmed_by_name ?? null : null,
      },
    },
  };
}

