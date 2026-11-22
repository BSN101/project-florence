export type ClearanceStatus = {
  cleared: boolean;
  confirmedAt: string | null;
  confirmedBy: string | null;
  confirmedByName?: string | null;
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

export const FACULTY_CLEARANCE_CONFIG = {
  academic: {
    label: "Academic",
    bucket: "office" as const,
    bucketLabel: "Office",
    role: "academic_coordinator",
    roleLabel: "Academic Coordinator",
    destination: "academic-clearance",
    path: "/faculty/academic-clearance",
    counterpart: "rle" as const,
    counterpartLabel: "RLE",
  },
  rle: {
    label: "RLE",
    bucket: "rle" as const,
    bucketLabel: "RLE",
    role: "rle_coordinator",
    roleLabel: "RLE Coordinator",
    destination: "rle-clearance",
    path: "/faculty/rle-clearance",
    counterpart: "academic" as const,
    counterpartLabel: "Academic",
  },
} as const;

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
  academicClearance: ClearanceStatus;
  rleClearance: ClearanceStatus;
};

export type ConfirmFacultyClearanceResult =
  | { success: true; clearanceId: string; confirmedAt: string }
  | { success: false; error: string; code?: string };

