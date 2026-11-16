export type ClearanceStatus = {
  cleared: boolean;
  confirmedAt: string | null;
  confirmedBy: string | null;
};

export type CouncilClearanceCandidate = {
  studentId: string;
  studentNumber: string;
  name: string;
  yearLevel: number;
  academicStatus: string;
  totalOutstandingPayable: number;
  activeCouncilDemerits: number;
  isSelf: boolean;
  status: ClearanceStatus;
};

export type ConfirmCouncilClearanceResult =
  | { success: true; clearanceId: string; confirmedAt: string }
  | { success: false; error: string; code?: string };
