import { z } from "zod";

export const YEAR_LEVELS = [1, 2, 3, 4] as const;
export const ACADEMIC_STATUSES = ["regular", "irregular"] as const;

const id = z.string().uuid("Invalid identifier");
const instant = z.iso.datetime({ offset: true, message: "Invalid date and time" });
const wholeNumber = z.coerce.number().int("Use a whole number").min(0, "Cannot be negative").max(10000);

export const saveEventSchema = z
  .object({
    id: id.nullable(),
    semesterId: id,
    name: z.string().trim().min(1, "Name is required").max(150),
    venue: z.string().trim().max(150).transform((value) => value || null),
    // One event day: time-in opening is the actual start, and both windows close at closesAt.
    timeInFrom: instant,
    timeOutFrom: instant.nullable(),
    closesAt: instant,
    lateAfterMinutes: wholeNumber,
    yearLevels: z.array(z.number().int().min(1).max(4)).min(1, "Select at least one year level"),
    academicStatuses: z.array(z.enum(ACADEMIC_STATUSES)).min(1, "Select at least one academic status"),
    absenceFineId: id.nullable(),
    lateFineId: id.nullable(),
    absenceDemeritDays: wholeNumber,
    lateDemeritDays: wholeNumber,
    requiresTimeOut: z.boolean(),
  })
  .superRefine((data, ctx) => {
    const t = (value: string) => Date.parse(value);
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (t(data.closesAt) <= t(data.timeInFrom)) issue("closesAt", "Attendance must close after time-in opens");
    else if (manilaDate(data.closesAt) !== manilaDate(data.timeInFrom)) issue("closesAt", "Attendance must close on the event date");
    if (data.timeOutFrom === null) {
      if (data.requiresTimeOut) issue("timeOutFrom", "Set when time-out opens, or stop requiring time-out");
    } else if (t(data.timeOutFrom) <= t(data.timeInFrom) || t(data.timeOutFrom) >= t(data.closesAt)) {
      issue("timeOutFrom", "Time-out must open after time-in opens and before attendance closes");
    }
  });

export const eventIdSchema = z.object({ eventId: id });

export const participantSearchSchema = z.object({
  eventId: id,
  query: z.string().trim().min(2, "Enter at least 2 characters").max(100),
});

export const recordAttendanceSchema = z.object({
  eventId: id,
  studentId: id,
  kind: z.enum(["time_in", "time_out"]),
  requestKey: id,
});

// The scanned payload is only the university number (FL-012); the database resolves it.
export const qrAttendanceSchema = z.object({
  eventId: id,
  universityId: z.string().trim().regex(/^[0-9]{2}-1-[0-9]{5}$/, "Not a Florence attendance QR"),
  kind: z.enum(["time_in", "time_out"]),
  requestKey: id,
});

// ~1 MB keeps 10,000 rows well under the server action body limit.
export const attendanceImportSchema = z.object({
  eventId: id,
  csv: z.string().min(1, "Choose a CSV file").max(1_000_000, "The file is too large"),
  requestKey: id.optional(),
});

export type SaveEventInput = z.input<typeof saveEventSchema>;
export type ParticipantSearchInput = z.infer<typeof participantSearchSchema>;
export type RecordAttendanceInput = z.infer<typeof recordAttendanceSchema>;
export type QrAttendanceInput = z.infer<typeof qrAttendanceSchema>;
export type AttendanceImportInput = z.infer<typeof attendanceImportSchema>;

/** Asia/Manila has a fixed +08:00 offset (no DST). `value` is a datetime-local string. */
export function manilaInputToIso(value: string): string | null {
  return value ? new Date(`${value}:00+08:00`).toISOString() : null;
}

/** Manila calendar date (YYYY-MM-DD) of an instant. */
export function manilaDate(value: string): string {
  return isoToManilaInput(value).slice(0, 10);
}

export function isoToManilaInput(value: string | null): string {
  if (!value) return "";
  return new Date(Date.parse(value) + 8 * 3600_000).toISOString().slice(0, 16);
}
