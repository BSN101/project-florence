import { z } from "zod";

const wholeDaysSchema = z.coerce
  .number()
  .int("Days must be a whole number.")
  .min(1, "Days must be at least 1.");

/** Product cap per merit or demerit entry; the RPCs create one row per day, so a typo must not mint thousands. */
export const MAX_ENTRY_DAYS = 5;

/** Whole-day units, 1 to MAX_ENTRY_DAYS. FL-030 and `award_merits` set no upper bound. */
export const meritDaysSchema = wholeDaysSchema.max(MAX_ENTRY_DAYS, `Days cannot exceed ${MAX_ENTRY_DAYS}.`);

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

/** Whole-day units, 1 to MAX_ENTRY_DAYS. FL-033 and `log_demerits` set no upper bound. */
export const demeritDaysSchema = meritDaysSchema;

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
    misconductId: z.string().uuid("Select a misconduct option."),
    isOther: z.boolean(),
    incidentOn: z.iso.date("Incident date must be a valid date."),
    notes: demeritNotesSchema,
  })
  .superRefine((data, ctx) => {
    if (data.isOther && (!data.notes || data.notes.trim().length < 3)) {
      ctx.addIssue({
        code: "custom",
        path: ["notes"],
        message: "Describe the specific misconduct when selecting Other (at least 3 characters).",
      });
    }
  });

export type LogFacultyDemeritsInput = z.infer<typeof logFacultyDemeritsSchema>;

// ---------------------------------------------------------------------------
// Merit endorsement schemas (FL-031 / T-043)
// ---------------------------------------------------------------------------

/** Product cap per endorsement; approval creates one merit row per day, so a typo must not mint hundreds. */
export const MAX_ENDORSEMENT_DAYS = 7;

/** Whole-day units, 1 to MAX_ENDORSEMENT_DAYS. `endorse_merit` checks only that days are positive. */
export const requestedDaysSchema = z.coerce
  .number()
  .int("Days must be a whole number.")
  .min(1, "Days must be at least 1.")
  .max(MAX_ENDORSEMENT_DAYS, `Days cannot exceed ${MAX_ENDORSEMENT_DAYS}.`);

export const endorsementDescriptionSchema = z
  .string()
  .trim()
  .min(3, "Description must be at least 3 characters.")
  .max(500, "Description cannot exceed 500 characters.");

export const submitMeritEndorsementsSchema = z.object({
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
  instructorId: z.string().uuid("Select an assigned instructor."),
  requestedDays: requestedDaysSchema,
  description: endorsementDescriptionSchema,
});

export type SubmitMeritEndorsementsInput = z.infer<typeof submitMeritEndorsementsSchema>;

// ---------------------------------------------------------------------------
// Merit endorsement decision schemas (FL-032 / T-044)
// ---------------------------------------------------------------------------

const endorsementDecisionSchema = z.enum(["approved", "rejected"], {
  message: "Select Approve or Reject.",
});

const endorsementDecisionReasonSchema = z
  .string()
  .trim()
  .max(500, "Reason cannot exceed 500 characters.")
  .nullish()
  .transform((val) => (val && val.length > 0 ? val : null));

export const decideMeritEndorsementSchema = z
  .object({
    requestKey: z.string().uuid("Invalid request key."),
    endorsementId: z.string().uuid("Invalid endorsement identifier."),
    decision: endorsementDecisionSchema,
    reason: endorsementDecisionReasonSchema,
  })
  .transform((data) => ({
    ...data,
    reason: data.decision === "approved" ? null : data.reason,
  }));

// ---------------------------------------------------------------------------
// Student merit application schemas (FL-036 / T-048)
// ---------------------------------------------------------------------------

export const disciplinaryBucketSchema = z.enum(["office", "rle"], {
  message: "Select Office or RLE.",
});

export const applyMeritsSchema = z.object({
  requestKey: z.string().uuid("Invalid request key."),
  bucket: disciplinaryBucketSchema,
  days: wholeDaysSchema.max(2147483647, "Days is too large."), // Postgres integer limit; applying is not an entry, so no entry cap
});

export type ApplyMeritsInput = z.infer<typeof applyMeritsSchema>;

// ---------------------------------------------------------------------------
// Demerit waiver schemas (FL-034 / T-046)
// ---------------------------------------------------------------------------

const waiveDemeritReasonSchema = z
  .string()
  .trim()
  .min(3, "Waiver reason must be at least 3 characters.")
  .max(500, "Waiver reason cannot exceed 500 characters.");

export const waiveDemeritSchema = z.object({
  requestKey: z.string().uuid("Invalid request key."),
  demeritId: z.string().uuid("Invalid demerit identifier."),
  reason: waiveDemeritReasonSchema,
});

// ---------------------------------------------------------------------------
// External CI merit and demerit schemas (FL-035 / T-047)
// ---------------------------------------------------------------------------

const externalCiRecipientsSchema = z
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
  );

const externalCiSourceNameSchema = z
  .string()
  .trim()
  .min(2, "External CI name must be at least 2 characters.")
  .max(120, "External CI name cannot exceed 120 characters.");

const externalCiDemeritNotesSchema = z
  .string()
  .trim()
  .max(500, "Notes cannot exceed 500 characters.")
  .nullish()
  .transform((val) => (val && val.length > 0 ? val : null));

export const awardExternalCiMeritsSchema = z.object({
  recipients: externalCiRecipientsSchema,
  externalSource: externalCiSourceNameSchema,
  days: meritDaysSchema,
  awardedOn: z.iso.date("Award date must be a valid date."),
  description: meritDescriptionSchema,
});

export const logExternalCiDemeritsSchema = z
  .object({
    recipients: externalCiRecipientsSchema,
    externalSource: externalCiSourceNameSchema,
    days: demeritDaysSchema,
    misconductId: z.string().uuid("Select a misconduct option."),
    isOther: z.boolean(),
    incidentOn: z.iso.date("Incident date must be a valid date."),
    notes: externalCiDemeritNotesSchema,
  })
  .superRefine((data, ctx) => {
    if (data.isOther && (!data.notes || data.notes.length < 3)) {
      ctx.addIssue({
        code: "custom",
        path: ["notes"],
        message: "Describe the specific misconduct when selecting Other (at least 3 characters).",
      });
    }
  });
