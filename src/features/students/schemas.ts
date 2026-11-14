import { z } from "zod";

import type { RosterImportRowInput, RosterImportRowResult } from "./contracts";

export const ACADEMIC_STATUSES = ["regular", "irregular"] as const;
export type AcademicStatus = (typeof ACADEMIC_STATUSES)[number];

export const FIXED_CSV_ROSTER_HEADERS = [
  "university_id",
  "last_name",
  "first_name",
  "middle_name",
  "suffix",
  "email",
  "year_level",
  "academic_status",
] as const;

const isBlank = (v: unknown) => v === undefined || v === null || String(v).trim() === "";

// Each field reports one message: "required" when empty, otherwise what is wrong with it.
export const studentNumberSchema = z.unknown().transform((v, ctx) => {
  const value = isBlank(v) ? "" : String(v).trim();
  if (!value) ctx.addIssue({ code: "custom", message: "Student number is required" });
  else if (!/^[0-9]{2}-1-[0-9]{5}$/.test(value)) {
    ctx.addIssue({ code: "custom", message: "Student number: use the format XX-1-XXXXX" });
  }
  return value;
});

export const yearLevelSchema = z.unknown().transform((v, ctx) => {
  if (isBlank(v)) {
    ctx.addIssue({ code: "custom", message: "Year level is required" });
    return z.NEVER;
  }
  const level = Number(v);
  if (!Number.isInteger(level) || level < 1 || level > 4) {
    ctx.addIssue({ code: "custom", message: "Year level must be between 1 and 4" });
    return z.NEVER;
  }
  return level;
});

export const academicStatusSchema = z.unknown().transform((v, ctx) => {
  const status = isBlank(v) ? "" : String(v).trim().toLowerCase();
  if (!status) {
    ctx.addIssue({ code: "custom", message: "Academic status is required" });
    return z.NEVER;
  }
  if (!(ACADEMIC_STATUSES as readonly string[]).includes(status)) {
    ctx.addIssue({ code: "custom", message: "Academic status must be regular or irregular" });
    return z.NEVER;
  }
  return status as AcademicStatus;
});

const optionalText = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : null));

const optionalEmail = z
  .string()
  .trim()
  .nullable()
  .optional()
  .refine((v) => !v || v.trim() === "" || z.string().email().safeParse(v.trim()).success, {
    message: "Invalid email address",
  })
  .transform((v) => (v && v.trim() !== "" ? v.trim() : null));

export const csvRosterRowSchema = z.object({
  university_id: studentNumberSchema,
  last_name: z.string().trim().min(1, "Last name is required"),
  first_name: z.string().trim().min(1, "First name is required"),
  middle_name: optionalText,
  suffix: optionalText,
  email: optionalEmail,
  year_level: yearLevelSchema,
  academic_status: academicStatusSchema,
});

// Manual entry uses the same contract as a CSV row.
export const createStudentSchema = csvRosterRowSchema;

export const updateStudentSchema = csvRosterRowSchema.omit({ university_id: true }).extend({
  student_id: z.string().uuid("Invalid student identifier"),
});

/**
 * Every format problem on each CSV row, plus student numbers repeated in the file.
 * `earlier` holds parser findings (e.g. too many columns) to keep on the same row.
 * Blank student numbers are reported as missing, never as duplicates of each other.
 */
export function rosterFormatFindings(
  rows: RosterImportRowInput[],
  earlier: RosterImportRowResult[] = [],
): RosterImportRowResult[] {
  const before = new Map(earlier.map((f) => [f.row, f.message.split("; ")]));
  const copies = new Map<string, number>();
  for (const r of rows) if (r.university_id) copies.set(r.university_id, (copies.get(r.university_id) ?? 0) + 1);

  return rows.flatMap((r) => {
    const parsed = csvRosterRowSchema.safeParse(r);
    const issues = [
      ...(before.get(r.row) ?? []),
      ...(parsed.success ? [] : parsed.error.issues.map((i) => i.message)),
      ...((copies.get(r.university_id) ?? 0) > 1 ? ["Student appears more than once in the file"] : []),
    ];
    if (issues.length === 0) return [];
    return [{
      row: r.row,
      university_id: r.university_id || `Row ${r.row}`,
      name: [r.first_name, r.last_name].filter(Boolean).join(" ") || "Unknown",
      action: "none" as const,
      status: "invalid" as const,
      message: [...new Set(issues)].join("; "),
    }];
  });
}

export const previewRosterImportSchema = z.object({
  csvText: z.string().min(1, "CSV file is empty"),
});

export const applyRosterImportSchema = z.object({
  requestKey: z.string().uuid("Invalid request key"),
  csvText: z.string().min(1, "CSV file is empty"),
});
export const inviteStudentSchema = z.object({
  studentId: z.string().uuid("Invalid student identifier"),
  requestKey: z.string().uuid().optional(),
});
export type InviteStudentInput = z.infer<typeof inviteStudentSchema>;

export const cancelInvitationSchema = z.object({
  invitationId: z.string().uuid("Invalid invitation identifier"),
  requestKey: z.string().uuid().optional(),
});
export type CancelInvitationInput = z.infer<typeof cancelInvitationSchema>;

export const bulkInviteSchema = z.object({
  semesterId: z.string().uuid("Invalid semester identifier"),
  // Students already handled in this run; excluding them lets the batch loop finish without resending.
  excludeIds: z.array(z.string().uuid()).max(5000).default([]),
});
export type BulkInviteInput = z.infer<typeof bulkInviteSchema>;
