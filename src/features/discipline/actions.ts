"use server";

import { revalidatePath } from "next/cache";

import { AccessDeniedError, requireWorkspace } from "@/server/auth/require-workspace";
import { createCommandClient } from "@/server/db/command-client";
import { getTodayManila } from "./calculations";
import { awardDirectMeritsSchema, logFacultyDemeritsSchema } from "./schemas";

const RPC_MESSAGES: [string, string][] = [
  ["Incident date must be within current context and not future", "The incident date must fall within the current semester and cannot be in the future."],
  ["Self disciplinary entry forbidden", "You cannot issue demerits to yourself."],
  ["Self award forbidden", "You cannot award merits to yourself."],
  ["Student enrollment in the specified semester required", "Not enrolled in the current semester."],
  ["Matching instructor assignment required", "You are not assigned as an instructor for this bucket."],
  ["Active misconduct option required", "The selected misconduct option is no longer active."],
  ["Other requires a specific incident description", "A specific incident description is required when 'Other' is selected."],
  ["Positive unit count and incident date required", "Units and incident date are required."],
  ["Award date must be in current academic context", "The award date must fall within the current semester and cannot be in the future."],
  ["Request key reused", "Already recorded with different details. Check My entries before submitting again."],
  ["Positive days, description and award date required", "Days, reason and award date are required."],
  ["Bucket required", "Select Office or RLE."],
];

// Database messages are not shown as-is; unknown ones get a generic message.
function formatRpcError(message: string, fallback = "Unable to record this entry. Try again."): string {
  return RPC_MESSAGES.find(([match]) => message.includes(match))?.[1] ?? fallback;
}

export type AwardFailure = { studentId: string; error: string };

export type AwardDirectMeritsResult =
  | { success: true; awardedIds: string[] }
  | { success: false; error: string; awardedIds: string[]; failures: AwardFailure[] };

function rejected(error: string): AwardDirectMeritsResult {
  return { success: false, error, awardedIds: [], failures: [] };
}

/**
 * Awards direct whole-day merits to each recipient (FL-030); `award_merits` also notifies the student (FL-044).
 * Each recipient is its own idempotent command, so one failure does not undo or block the others.
 */
export async function awardDirectMeritsAction(rawInput: unknown): Promise<AwardDirectMeritsResult> {
  let actorId: string;
  try {
    actorId = (await requireWorkspace("faculty")).profile.id;
  } catch (err) {
    return rejected(err instanceof AccessDeniedError ? "You are not permitted to award merits." : "Unable to verify your access. Try again.");
  }

  const parsed = awardDirectMeritsSchema.safeParse(rawInput);
  if (!parsed.success) return rejected(parsed.error.issues[0]?.message ?? "Check the award details.");

  const { recipients, days, awardedOn, description } = parsed.data;
  if (awardedOn > getTodayManila()) return rejected("Award date cannot be in the future.");
  if (recipients.some((r) => r.studentId === actorId)) return rejected("You cannot award merits to yourself.");

  const client = createCommandClient();
  const awardedIds: string[] = [];
  const failures: AwardFailure[] = [];

  for (const { studentId, requestKey } of recipients) {
    try {
      const { error } = await client.rpc("award_merits", {
        p_key: requestKey,
        p_actor: actorId,
        p_student: studentId,
        p_days: days,
        p_description: description,
        p_awarded_on: awardedOn,
      });
      if (error) failures.push({ studentId, error: formatRpcError(error.message) });
      else awardedIds.push(studentId);
    } catch {
      failures.push({ studentId, error: "Unable to reach the server. Try again." });
    }
  }

  if (awardedIds.length) revalidatePath("/faculty/my-merits-and-demerits");
  if (!failures.length) return { success: true, awardedIds };
  return {
    success: false,
    error: awardedIds.length ? "Some awards were not recorded." : "No awards were recorded.",
    awardedIds,
    failures,
  };
}

export type DemeritFailure = { studentId: string; error: string };

export type LogFacultyDemeritsResult =
  | { success: true; recordedIds: string[] }
  | { success: false; error: string; recordedIds: string[]; failures: DemeritFailure[] };

function rejectedDemerit(error: string): LogFacultyDemeritsResult {
  return { success: false, error, recordedIds: [], failures: [] };
}

/**
 * Logs incident-based demerits with whole-day units in the selected bucket (FL-033).
 * `log_demerits` also triggers the in-app notification to each student (FL-044).
 * Each recipient is executed as an isolated idempotent command, so partial failures
 * report clearly without rolling back successful entries.
 */
export async function logFacultyDemeritsAction(rawInput: unknown): Promise<LogFacultyDemeritsResult> {
  let context: Awaited<ReturnType<typeof requireWorkspace>>;
  try {
    context = await requireWorkspace("faculty");
  } catch (err) {
    return rejectedDemerit(
      err instanceof AccessDeniedError ? "You are not permitted to log demerits." : "Unable to verify your access. Try again."
    );
  }

  const parsed = logFacultyDemeritsSchema.safeParse(rawInput);
  if (!parsed.success) return rejectedDemerit(parsed.error.issues[0]?.message ?? "Check the demerit details.");

  const { recipients, days, bucket, misconductId, incidentOn, notes } = parsed.data;
  const actorId = context.profile.id;

  if (incidentOn > getTodayManila()) return rejectedDemerit("Incident date cannot be in the future.");
  if (recipients.some((r) => r.studentId === actorId)) return rejectedDemerit("You cannot issue demerits to yourself.");

  const hasAcademic = context.roles.includes("Academic Instructor");
  const hasClinical = context.roles.includes("Clinical Instructor");
  if (bucket === "office" && !hasAcademic) {
    return rejectedDemerit("Only Academic Instructors can issue Office demerits.");
  }
  if (bucket === "rle" && !hasClinical) {
    return rejectedDemerit("Only Clinical Instructors can issue RLE demerits.");
  }

  const client = createCommandClient();
  const recordedIds: string[] = [];
  const failures: DemeritFailure[] = [];

  for (const { studentId, requestKey } of recipients) {
    try {
      const { error } = await client.rpc("log_demerits", {
        p_key: requestKey,
        p_actor: actorId,
        p_student: studentId,
        p_bucket: bucket,
        p_days: days,
        p_misconduct: misconductId,
        p_description: notes.trim(),
        p_incident_on: incidentOn,
      });
      if (error) {
        failures.push({ studentId, error: formatRpcError(error.message, "Unable to record this demerit. Try again.") });
      } else {
        recordedIds.push(studentId);
      }
    } catch {
      failures.push({ studentId, error: "Unable to reach the server. Try again." });
    }
  }

  if (recordedIds.length) revalidatePath("/faculty/my-merits-and-demerits");
  if (!failures.length) return { success: true, recordedIds };
  return {
    success: false,
    error: recordedIds.length ? "Some demerits were not recorded." : "No demerits were recorded.",
    recordedIds,
    failures,
  };
}
