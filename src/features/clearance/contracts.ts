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

export type FacultyClearanceComponent = "academic" | "rle";

export type FacultyClearanceCandidate = {
  studentId: string;
  studentNumber: string;
  name: string;
  yearLevel: number;
  academicStatus: string;
  councilCleared: boolean;
  councilConfirmedAt: string | null;
  bucket: "office" | "rle";
  activeDemerits: number;
  appliedMerits: number;
  serviceCredits: number;
  netBalance: number;
  isSelf: boolean;
  status: ClearanceStatus;
};

export type ConfirmFacultyClearanceResult =
  | { success: true; clearanceId: string; confirmedAt: string }
  | { success: false; error: string; code?: string };

