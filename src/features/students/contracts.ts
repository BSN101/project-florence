import type { Database } from "@/server/db/database.types";

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type EnrollmentRow = Database["public"]["Tables"]["enrollments"]["Row"];

export type StudentRosterItem = {
  enrollment_id: string;
  student_id: string;
  semester_id: string;
  university_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  email: string | null;
  year_level: number;
  academic_status: Database["public"]["Enums"]["academic_status"];
  account_status: string;
  has_auth_account: boolean;
  created_at: string;
  updated_at: string;
};

export type StudentConflictPreview = {
  exists: boolean;
  student_id?: string;
  university_id: string;
  first_name?: string;
  middle_name?: string | null;
  last_name?: string;
  suffix?: string | null;
  email?: string | null;
  is_enrolled_in_active_semester: boolean;
  active_semester_year_level?: number;
  active_semester_academic_status?: Database["public"]["Enums"]["academic_status"];
};

export type StudentActionResult =
  | { success: true; message: string; student?: StudentRosterItem }
  | { success: false; error: string };
