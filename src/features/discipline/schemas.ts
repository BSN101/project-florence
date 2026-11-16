import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * Derives a deterministic RFC-4122 v4-formatted UUID from a client submissionKey and studentId.
 * Ensures retries or double-clicks produce the exact same request keys for f_cmd_begin idempotency.
 */
export function deriveStudentRequestKey(submissionKey: string, studentId: string): string {
  const hash = createHash("sha256").update(`${submissionKey}:${studentId}`).digest("hex");
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    "4" + hash.substring(13, 16),
    ((parseInt(hash.substring(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0") + hash.substring(18, 20),
    hash.substring(20, 32),
  ].join("-");
}

export const awardDirectMeritsSchema = z.object({
  submissionKey: z.string().uuid("Invalid submission key."),
  studentIds: z
    .array(z.string().uuid("Invalid student identifier."))
    .min(1, "Select at least one student."),
  days: z.coerce
    .number()
    .int("Days must be a whole number.")
    .min(1, "Days must be at least 1.")
    .max(30, "Maximum 30 days per entry."),
  awardedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Award date must be in YYYY-MM-DD format."),
  description: z
    .string()
    .trim()
    .min(3, "Description must be at least 3 characters.")
    .max(500, "Description cannot exceed 500 characters."),
});

export type AwardDirectMeritsInput = z.infer<typeof awardDirectMeritsSchema>;
