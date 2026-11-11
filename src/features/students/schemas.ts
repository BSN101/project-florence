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

export const createStudentSchema = z.object({
  university_id: studentNumberSchema,
  last_name: z.string().trim().min(1, "Last name is required"),
  first_name: z.string().trim().min(1, "First name is required"),
  middle_name: optionalText,
  suffix: optionalText,
  email: optionalEmail,
  year_level: yearLevelSchema,
  academic_status: academicStatusSchema,
});

export const updateStudentSchema = z.object({
  student_id: z.string().uuid("Invalid student identifier"),
  last_name: z.string().trim().min(1, "Last name is required"),
  first_name: z.string().trim().min(1, "First name is required"),
  middle_name: optionalText,
  suffix: optionalText,
  email: optionalEmail,
  year_level: yearLevelSchema,
  academic_status: academicStatusSchema,
});

export const studentLookupSchema = z.object({
  university_id: studentNumberSchema,
});

export const studentFilterSchema = z.object({
  search: z.string().trim().optional(),
  year_level: z.coerce.number().int().min(1).max(4).optional(),
  academic_status: z.enum(["regular", "irregular", "all"]).optional(),
});

export type CsvRosterRowInput = z.infer<typeof csvRosterRowSchema>;
export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
export type StudentFilterInput = z.infer<typeof studentFilterSchema>;
