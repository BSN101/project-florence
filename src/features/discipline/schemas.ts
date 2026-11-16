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
