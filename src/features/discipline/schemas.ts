import { z } from "zod";

/** Whole-day units: FL-030 sets no upper bound, and neither does `award_merits`. */
export const meritDaysSchema = z.coerce
  .number()
  .int("Days must be a whole number.")
  .min(1, "Days must be at least 1.");

export const meritDescriptionSchema = z
  .string()
  .trim()
  .min(3, "Reason must be at least 3 characters.")
  .max(500, "Reason cannot exceed 500 characters.");

export const awardDirectMeritsSchema = z.object({
  // One idempotency key per recipient, made by the client when the student is picked.
  recipients: z
    .array(z.object({
      studentId: z.string().uuid("Invalid student identifier."),
      requestKey: z.string().uuid("Invalid request key."),
    }))
    .min(1, "Select at least one student.")
    .refine((list) => new Set(list.map((r) => r.studentId)).size === list.length, "Each student can be selected once."),
  days: meritDaysSchema,
  awardedOn: z.iso.date("Award date must be a valid date."),
  description: meritDescriptionSchema,
});

export type AwardDirectMeritsInput = z.infer<typeof awardDirectMeritsSchema>;

// ---------------------------------------------------------------------------
// Demerit logging schemas (FL-033 / T-045)
// ---------------------------------------------------------------------------

/** Whole-day units: FL-033 sets no upper bound, and neither does `log_demerits`. */
export const demeritDaysSchema = z.coerce
  .number()
  .int("Days must be a whole number.")
  .min(1, "Days must be at least 1.");

export const demeritBucketSchema = z.enum(["office", "rle"], {
  error: "Select Office or RLE.",
});

/**
 * Incident description: required when the catalog option is "Other"; optional
 * (but trimmed and length-capped) for standard catalog items.
 * The final validation depends on `isOther`, enforced in the composite schema.
 */
export const demeritNotesSchema = z
  .string()
  .trim()
  .max(500, "Notes cannot exceed 500 characters.")
  .optional()
  .default("");

export const logFacultyDemeritsSchema = z
  .object({
    recipients: z
      .array(
        z.object({
          studentId: z.string().uuid("Invalid student identifier."),
          requestKey: z.string().uuid("Invalid request key."),
        })
      )
      .min(1, "Select at least one student.")
      .refine(
        (list) => new Set(list.map((r) => r.studentId)).size === list.length,
        "Each student can be selected once."
      ),
    days: demeritDaysSchema,
    bucket: demeritBucketSchema,
    misconductId: z.string().uuid("Select a misconduct option."),
    isOther: z.boolean(),
    incidentOn: z.iso.date("Incident date must be a valid date."),
    notes: demeritNotesSchema,
  })
  .superRefine((data, ctx) => {
    if (data.isOther && (!data.notes || data.notes.trim().length < 3)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["notes"],
        message: "Describe the specific misconduct when selecting Other (at least 3 characters).",
      });
    }
  });

export type LogFacultyDemeritsInput = z.infer<typeof logFacultyDemeritsSchema>;
