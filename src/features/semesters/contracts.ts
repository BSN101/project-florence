import type { Database } from "@/server/db/database.types";

export type SemesterRow = Database["public"]["Tables"]["semesters"]["Row"];

export type SemesterListItem = Pick<
  SemesterRow,
  "id" | "academic_year_start" | "term" | "starts_on" | "ends_on" | "is_current" | "created_at"
>;

export type SemesterActionResult =
  | { success: true; message?: string; semester?: SemesterListItem }
  | { success: false; error: string };
