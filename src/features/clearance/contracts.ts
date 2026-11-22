import type { ConfirmFacultyClearanceInput } from "./schemas";

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

export type FacultyClearanceComponent = ConfirmFacultyClearanceInput["component"];

export const FACULTY_CLEARANCE_CONFIG = {
  academic: {
    label: "Academic",
    bucket: "office" as const,
    bucketLabel: "Office",
    destination: "academic-clearance",
    path: "/faculty/academic-clearance",
  },
  rle: {
    label: "RLE",
    bucket: "rle" as const,
    bucketLabel: "RLE",
    destination: "rle-clearance",
    path: "/faculty/rle-clearance",
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

export type ConfirmFacultyClearanceResult = ConfirmCouncilClearanceResult;

