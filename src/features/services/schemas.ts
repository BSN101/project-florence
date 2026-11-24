import { z } from "zod";

/**
 * Valid service duty buckets:
 * - "office": Office Duty (Academic Instructor)
 * - "rle": Clinical / RLE Duty (Clinical Instructor)
 */
export const serviceBucketSchema = z.enum(["office", "rle"], {
  message: "Select Office or Clinical (RLE).",
});

/**
 * Validates creating a one-day service session (FL-037).
 * Strictly mirrors PostgreSQL public.create_service_session:
 * - duty_on must be a valid calendar date
 * - scheduled_start and scheduled_end must fall on duty_on in Asia/Manila (+08:00)
 * - scheduled_end > scheduled_start
 * - late_after_minutes >= 0, capped at PostgreSQL 32-bit signed integer limit (2147483647)
 * - time_in_until >= time_in_from
 * - time_out_until >= time_out_from
 */
export const createServiceSessionSchema = z
  .object({
    requestKey: z.string().uuid("Invalid request key."),
    bucket: serviceBucketSchema,
    dutyOn: z.iso.date("Duty date must be a valid calendar date (YYYY-MM-DD)."),
    scheduledStart: z.iso.datetime({
      offset: true,
      message: "Scheduled start must be a valid timestamp with timezone offset.",
    }),
    scheduledEnd: z.iso.datetime({
      offset: true,
      message: "Scheduled end must be a valid timestamp with timezone offset.",
    }),
    location: z
      .string()
      .trim()
      .max(255, "Location cannot exceed 255 characters.")
      .nullish()
      .transform((val) => (val && val.length > 0 ? val : null)),
    lateAfterMinutes: z.coerce
      .number()
      .int("Grace period must be a whole number of minutes.")
      .min(0, "Grace period cannot be negative.")
      .max(2147483647, "Grace period is too large."),
    timeInFrom: z.iso.datetime({
      offset: true,
      message: "Time-in opening must be a valid timestamp with timezone offset.",
    }),
    timeInUntil: z.iso.datetime({
      offset: true,
      message: "Time-in closing must be a valid timestamp with timezone offset.",
    }),
    timeOutFrom: z.iso.datetime({
      offset: true,
      message: "Time-out opening must be a valid timestamp with timezone offset.",
    }),
    timeOutUntil: z.iso.datetime({
      offset: true,
      message: "Time-out closing must be a valid timestamp with timezone offset.",
    }),
  })
  .superRefine((data, ctx) => {
    // Helper to get calendar date YYYY-MM-DD in Asia/Manila (+08:00)
    const toManilaDate = (iso: string) => {
      const ms = Date.parse(iso);
      if (Number.isNaN(ms)) return "";
      return new Date(ms + 8 * 3600_000).toISOString().slice(0, 10);
    };

    const startMs = Date.parse(data.scheduledStart);
    const endMs = Date.parse(data.scheduledEnd);
    const timeInFromMs = Date.parse(data.timeInFrom);
    const timeInUntilMs = Date.parse(data.timeInUntil);
    const timeOutFromMs = Date.parse(data.timeOutFrom);
    const timeOutUntilMs = Date.parse(data.timeOutUntil);

    // 1. Scheduled start and end must fall on dutyOn in Asia/Manila
    if (toManilaDate(data.scheduledStart) !== data.dutyOn) {
      ctx.addIssue({
        code: "custom",
        path: ["scheduledStart"],
        message: "Scheduled start must fall on the duty date.",
      });
    }

    if (toManilaDate(data.scheduledEnd) !== data.dutyOn) {
      ctx.addIssue({
        code: "custom",
        path: ["scheduledEnd"],
        message: "Scheduled end must fall on the duty date.",
      });
    }

    // 2. scheduled_end > scheduled_start
    if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs <= startMs) {
      ctx.addIssue({
        code: "custom",
        path: ["scheduledEnd"],
        message: "Scheduled end time must be after scheduled start time.",
      });
    }

    // 3. time_in_until >= time_in_from
    if (
      !Number.isNaN(timeInFromMs) &&
      !Number.isNaN(timeInUntilMs) &&
      timeInUntilMs < timeInFromMs
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["timeInUntil"],
        message: "Time-in closing must be on or after time-in opening.",
      });
    }

    // 4. time_out_until >= time_out_from
    if (
      !Number.isNaN(timeOutFromMs) &&
      !Number.isNaN(timeOutUntilMs) &&
      timeOutUntilMs < timeOutFromMs
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["timeOutUntil"],
        message: "Time-out closing must be on or after time-out opening.",
      });
    }
  });

export type CreateServiceSessionInput = z.infer<typeof createServiceSessionSchema>;

/**
 * Validates a single participant attendance record in a batch.
 * Matches SQL set_service_participants rules:
 * - time_in: nullable ISO timestamp
 * - time_out: nullable ISO timestamp; requires time_in if set, and time_out > time_in
 * - excluded: boolean
 */
export const participantAttendanceRowSchema = z
  .object({
    studentId: z.string().uuid("Invalid student identifier."),
    timeIn: z.iso
      .datetime({ offset: true, message: "Invalid time-in timestamp with timezone offset." })
      .nullable(),
    timeOut: z.iso
      .datetime({ offset: true, message: "Invalid time-out timestamp with timezone offset." })
      .nullable(),
    excluded: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.timeOut !== null && data.timeIn === null) {
      ctx.addIssue({
        code: "custom",
        path: ["timeIn"],
        message: "Time-in is required when time-out is recorded.",
      });
    } else if (
      data.timeIn !== null &&
      data.timeOut !== null &&
      Date.parse(data.timeOut) <= Date.parse(data.timeIn)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["timeOut"],
        message: "Time-out must be after time-in.",
      });
    }
  });

export type ParticipantAttendanceRowInput = z.infer<typeof participantAttendanceRowSchema>;

/**
 * Validates setting service participants and attendance via set_service_participants.
 * Enforces batch size between 1 and 10,000, and ensures no duplicate students.
 */
export const setServiceParticipantsSchema = z
  .object({
    requestKey: z.string().uuid("Invalid request key."),
    sessionId: z.string().uuid("Invalid session identifier."),
    rows: z
      .array(participantAttendanceRowSchema)
      .min(1, "At least one participant is required.")
      .max(10000, "Participant batch cannot exceed 10,000 students."),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    for (let i = 0; i < data.rows.length; i++) {
      const studentId = data.rows[i].studentId;
      if (seen.has(studentId)) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", i, "studentId"],
          message: "Duplicate student in participant list.",
        });
      }
      seen.add(studentId);
    }
  });

export type SetServiceParticipantsInput = z.infer<typeof setServiceParticipantsSchema>;

/**
 * Validates ending a service session (FL-038).
 * Parameters required by PostgreSQL public.end_service_session:
 * - requestKey: UUID idempotency key
 * - sessionId: UUID of the service session to finalize
 */
export const endServiceSessionSchema = z.object({
  requestKey: z.string().uuid("Invalid request key."),
  sessionId: z.string().uuid("Invalid session identifier."),
});

export type EndServiceSessionInput = z.infer<typeof endServiceSessionSchema>;

/**
 * Validates the mandatory reason for revoking a service credit (FL-039).
 * Matches faculty disciplinary reason bounds (3 to 500 trimmed characters)
 * and PostgreSQL public.revoke_service_credit non-blank check.
 */
export const revokeServiceCreditReasonSchema = z
  .string()
  .trim()
  .min(3, "Revocation reason must be at least 3 characters.")
  .max(500, "Revocation reason cannot exceed 500 characters.");

/**
 * Validates revoking an issued service credit (FL-039).
 * Parameters required by PostgreSQL public.revoke_service_credit:
 * - requestKey: UUID idempotency key
 * - creditId: UUID of the service credit to revoke
 * - reason: Non-blank trimmed reason (3 to 500 characters)
 */
export const revokeServiceCreditSchema = z.object({
  requestKey: z.string().uuid("Invalid request key."),
  creditId: z.string().uuid("Invalid service credit identifier."),
  reason: revokeServiceCreditReasonSchema,
});

export type RevokeServiceCreditInput = z.infer<typeof revokeServiceCreditSchema>;


