import { z } from "zod";

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

export const studentNumberSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{2}-1-[0-9]{5}$/, "Format must be XX-1-XXXXX");

export const yearLevelSchema = z.coerce
  .number()
  .int()
  .min(1, "Year level must be between 1 and 4")
  .max(4, "Year level must be between 1 and 4");

export const academicStatusSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
  z.enum(ACADEMIC_STATUSES, {
    message: "Academic status must be regular or irregular",
  }),
);

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

export const rosterImportRowInputSchema = z.object({
  row: z.number().int().min(2),
  university_id: z.string().trim(),
  last_name: z.string().trim(),
  first_name: z.string().trim(),
  middle_name: optionalText,
  suffix: optionalText,
  email: optionalEmail,
  year_level: yearLevelSchema,
  academic_status: academicStatusSchema,
});

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
