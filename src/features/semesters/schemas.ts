import { z } from "zod";

export const APPROVED_SEMESTER_TERMS = ["1st Semester", "2nd Semester", "Midyear"] as const;

export type SemesterTerm = (typeof APPROVED_SEMESTER_TERMS)[number];

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const semesterFilterSchema = z.object({
  semester: z.string().uuid().optional(),
});

export const createSemesterSchema = z.object({
  academic_year_start: z.number().int().min(1900).max(9998),
  term: z.enum(APPROVED_SEMESTER_TERMS),
  starts_on: z.string().regex(dateRegex, "Start date must be in YYYY-MM-DD format"),
  ends_on: z.string().regex(dateRegex, "End date must be in YYYY-MM-DD format"),
}).refine((data) => data.ends_on >= data.starts_on, {
  message: "End date must be on or after start date",
  path: ["ends_on"],
});

export const activateSemesterSchema = z.object({
  semesterId: z.string().uuid(),
  expectedCurrentSemesterId: z.string().uuid().nullable(),
});

export type SemesterFilterInput = z.infer<typeof semesterFilterSchema>;
export type CreateSemesterInput = z.infer<typeof createSemesterSchema>;
export type ActivateSemesterInput = z.infer<typeof activateSemesterSchema>;
