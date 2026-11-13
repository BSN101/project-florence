import type { Database } from "@/server/db/database.types";

type Functions = Database["public"]["Functions"];
// Generated RPC row types mark every column non-null; these optional parts can be NULL.
type Nullable = { middle_name: string | null; suffix: string | null; email: string | null };

/** One row of florence_roster: a semester enrollment and its student's names. */
export type StudentRosterItem = Omit<Functions["florence_roster"]["Returns"][number], keyof Nullable> & Nullable;

/** One student found by exact number, shown before adding them to the roster. */
export type RosterCandidate = Omit<Functions["florence_roster_candidate"]["Returns"][number], keyof Nullable> & Nullable;

export type StudentActionResult =
  | { success: true; message: string }
  | { success: false; error: string };

export type RosterImportRowAction = "create" | "re_enroll" | "update" | "none";
export type RosterImportRowStatus = "ready" | "conflict" | "invalid";

export type RosterImportRowInput = {
  row: number;
  university_id: string;
  last_name: string;
  first_name: string;
  middle_name: string | null;
  suffix: string | null;
  email: string | null;
  year_level: number;
  academic_status: string;
};

export type RosterImportRowResult = {
  row: number;
  university_id: string;
  name: string;
  action: RosterImportRowAction;
  status: RosterImportRowStatus;
  message: string;
};

export type RosterImportPreview = {
  semester_id: string;
  ready: number;
  conflicts: number;
  invalid: number;
  created: number;
  re_enrolled: number;
  updated: number;
  rows: RosterImportRowResult[];
};

export type RosterImportPreviewResult =
  | { success: true; preview: RosterImportPreview }
  | { success: false; error: string };

export type RosterImportResult =
  | {
      success: true;
      message: string;
      summary: { total: number; created: number; re_enrolled: number; updated: number };
    }
  | {
      success: false;
      error: string;
      preview?: RosterImportPreview;
    };
