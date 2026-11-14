import { z } from "zod";

const definitionName = z
  .string()
  .trim()
  .min(1, "Name cannot be empty")
  .max(100, "Name cannot exceed 100 characters");

const definitionAmount = z.coerce
  .number("Amount must be a number")
  .positive("Amount must be greater than zero")
  .max(9999999.99, "Amount exceeds maximum permitted value")
  .refine(
    (val) => Number.isFinite(val) && /^\d+(?:\.\d{1,2})?$/.test(String(val)),
    { message: "Amount can have at most 2 decimal places" }
  );

const definitionId = z.string().uuid("Invalid definition identifier");

// Fee and fine definitions share identical validation rules.
export const createDefinitionSchema = z.object({
  name: definitionName,
  amount: definitionAmount,
});

export const updateDefinitionSchema = z.object({
  id: definitionId,
  name: definitionName,
  amount: definitionAmount,
});

export const archiveDefinitionSchema = z.object({
  id: definitionId,
});

export const YEAR_LEVELS = [1, 2, 3, 4] as const;
export type YearLevel = (typeof YEAR_LEVELS)[number];

export const ACADEMIC_STATUSES = ["regular", "irregular"] as const;
export type AcademicStatus = (typeof ACADEMIC_STATUSES)[number];

export const feeAudienceYearLevelsSchema = z
  .array(z.number().int().min(1).max(4))
  .min(1, "Select at least one year level")
  .refine((arr) => new Set(arr).size === arr.length, {
    message: "Duplicate year levels are not permitted",
  });

export const feeAudienceAcademicStatusesSchema = z
  .array(z.enum(ACADEMIC_STATUSES))
  .min(1, "Select at least one academic status")
  .refine((arr) => new Set(arr).size === arr.length, {
    message: "Duplicate academic statuses are not permitted",
  });

export const previewFeeObligationsSchema = z.object({
  feeDefinitionId: definitionId,
  semesterId: z.string().uuid("Invalid semester identifier"),
  yearLevels: feeAudienceYearLevelsSchema,
  academicStatuses: feeAudienceAcademicStatusesSchema,
});

export const publishFeeObligationsSchema = previewFeeObligationsSchema.extend({
  requestKey: z.string().uuid("Invalid request key").optional(),
});

export type CreateDefinitionInput = z.infer<typeof createDefinitionSchema>;
export type UpdateDefinitionInput = z.infer<typeof updateDefinitionSchema>;
export type ArchiveDefinitionInput = z.infer<typeof archiveDefinitionSchema>;
export type PreviewFeeObligationsInput = z.infer<typeof previewFeeObligationsSchema>;
export type PublishFeeObligationsInput = z.infer<typeof publishFeeObligationsSchema>;
