"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";

import { AccessDeniedError, requireWorkspace } from "@/server/auth/require-workspace";
import { createCommandClient } from "@/server/db/command-client";
import { getTodayManila, instructorBucket } from "./calculations";
import {
  applyMeritsSchema,
  awardDirectMeritsSchema,
  logFacultyDemeritsSchema,
  submitMeritEndorsementsSchema,
} from "./schemas";

const RPC_MESSAGES: [string, string][] = [
  ["Election exceeds matching outstanding balance", "You have fewer outstanding demerits in this bucket than the days requested."],
  ["Election exceeds available unexpired merits", "You do not have enough unexpired, unapplied merits for this many days."],
  ["Positive whole-day election and bucket required", "Select a bucket and at least 1 day."],
  ["Student identity required", "Student identity is required to apply merits."],
  ["Incident date must be within current context and not future", "The incident date must fall within the current semester and cannot be in the future."],
  ["Self disciplinary entry forbidden", "You cannot issue demerits to yourself."],
  ["Self award forbidden", "You cannot award merits to yourself."],
  ["Self endorsement forbidden", "You cannot endorse yourself for merits."],
  ["Council action not authorized", "You are not authorized to endorse students for merits."],
  ["Positive days and description required", "Requested days and description are required."],
  ["Activate a semester before creating academic records", "There is no active semester configured."],
  ["Student enrollment in the specified semester required", "Not enrolled in the current semester."],
  ["Matching instructor assignment required", "Only Academic or Clinical Instructors can award merits or log demerits."],
  ["Active misconduct option required", "The selected misconduct option is no longer active."],
  ["Other requires a specific incident description", "A specific incident description is required when 'Other' is selected."],
  ["Positive unit count and incident date required", "Units and incident date are required."],
  ["Award date must be in current academic context", "The award date must fall within the current semester and cannot be in the future."],
  ["Request key reused", "Already recorded with different details. Check My entries before submitting again."],
  ["Positive days, description and award date required", "Days, reason and award date are required."],
  ["Bucket required", "Select Office or RLE."],
];

// In endorse_merit the instructor check is on the chosen reviewer, not the Council actor.
const ENDORSEMENT_MESSAGES: [string, string][] = [
  ["Matching instructor assignment required", "The selected instructor can no longer review endorsements. Choose another instructor."],
  ...RPC_MESSAGES,
];

// Database messages are not shown as-is; unknown ones get a generic message.
function formatRpcError(
  message: string,
  fallback = "Unable to record this award. Try again.",
  messages = RPC_MESSAGES,
): string {
  return messages.find(([match]) => message.includes(match))?.[1] ?? fallback;
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

  const { recipients, days, misconductId, incidentOn, notes } = parsed.data;
  const actorId = context.profile.id;

  if (incidentOn > getTodayManila()) return rejectedDemerit("Incident date cannot be in the future.");
  if (recipients.some((r) => r.studentId === actorId)) return rejectedDemerit("You cannot issue demerits to yourself.");

  const bucket = instructorBucket(context.roles);
  if (!bucket) return rejectedDemerit("Only Academic or Clinical Instructors can log demerits.");

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

export type EndorsementFailure = { studentId: string; error: string };

export type SubmitMeritEndorsementsResult =
  | { success: true; endorsedIds: string[] }
  | { success: false; error: string; endorsedIds: string[]; failures: EndorsementFailure[] };

function rejectedEndorsement(error: string): SubmitMeritEndorsementsResult {
  return { success: false, error, endorsedIds: [], failures: [] };
}

/**
 * Submits merit recommendations for student(s) with an assigned reviewer instructor (FL-031).
 * Submission places the endorsement in 'pending' status; usable merit is awarded only upon instructor approval (FL-032).
 * Each recipient is executed as an isolated idempotent command, so partial failures report clearly.
 */
export async function submitMeritEndorsementsAction(rawInput: unknown): Promise<SubmitMeritEndorsementsResult> {
  let context: Awaited<ReturnType<typeof requireWorkspace>>;
  try {
    context = await requireWorkspace("council");
  } catch (err) {
    return rejectedEndorsement(
      err instanceof AccessDeniedError ? "You are not permitted to submit merit endorsements." : "Unable to verify your access. Try again."
    );
  }

  if (context.councilRole !== "executive" && context.councilRole !== "operations") {
    return rejectedEndorsement("Only Council Executive and Operations officers can submit merit endorsements.");
  }

  const parsed = submitMeritEndorsementsSchema.safeParse(rawInput);
  if (!parsed.success) return rejectedEndorsement(parsed.error.issues[0]?.message ?? "Check the endorsement details.");

  const { recipients, instructorId, requestedDays, description } = parsed.data;
  const actorId = context.profile.id;

  if (recipients.some((r) => r.studentId === actorId)) {
    return rejectedEndorsement("You cannot endorse yourself for merits.");
  }

  const client = createCommandClient();

  // endorse_merit checks enrollment only; archived profiles are denied here (AGENTS.md §5).
  const { data: archived, error: archivedError } = await client
    .from("profiles")
    .select("id")
    .in("id", recipients.map((r) => r.studentId))
    .eq("account_status", "archived");
  if (archivedError) return rejectedEndorsement("Unable to check the selected students. Try again.");
  if (archived.length) return rejectedEndorsement("Archived students cannot be endorsed for merit.");

  const endorsedIds: string[] = [];
  const failures: EndorsementFailure[] = [];

  for (const { studentId, requestKey } of recipients) {
    try {
      const { error } = await client.rpc("endorse_merit", {
        p_key: requestKey,
        p_actor: actorId,
        p_student: studentId,
        p_instructor: instructorId,
        p_days: requestedDays,
        p_description: description.trim(),
      });
      if (error) {
        failures.push({
          studentId,
          error: formatRpcError(error.message, "Unable to submit this endorsement. Try again.", ENDORSEMENT_MESSAGES),
        });
      } else {
        endorsedIds.push(studentId);
      }
    } catch {
      failures.push({ studentId, error: "Unable to reach the server. Try again." });
    }
  }

  if (endorsedIds.length) {
    revalidatePath("/council/merit-endorsements-and-council-demerits");
  }
  if (!failures.length) return { success: true, endorsedIds };
  return {
    success: false,
    error: endorsedIds.length ? "Some endorsements were not submitted." : "No endorsements were submitted.",
    endorsedIds,
    failures,
  };
}

// retryable: the RPC may have committed, so the client must resend the same request key.
export type ApplyMeritsResult = { success: false; error: string; retryable?: true };

/**
 * Applies unexpired, unapplied merits to offset active demerit debt in the chosen bucket (FL-036).
 * Executes atomic `public.apply_merits` RPC with row-level balance serialization and earliest-expiring FIFO consumption.
 * On success, revalidates student routes and redirects atomically to `?applied=<applicationGroupId>`.
 */
export async function applyMeritsAction(rawInput: unknown): Promise<ApplyMeritsResult> {
  let actorId: string;
  try {
    actorId = (await requireWorkspace("student")).profile.id;
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof AccessDeniedError
          ? "You are not permitted to apply merits."
          : "Unable to verify your access. Try again.",
    };
  }

  const parsed = applyMeritsSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Check the merit application details.",
    };
  }

  const { requestKey, bucket, days } = parsed.data;
  const client = createCommandClient();

  try {
    const { error } = await client.rpc("apply_merits", {
      p_key: requestKey,
      p_actor: actorId,
      p_bucket: bucket,
      p_days: days,
    });

    if (error) {
      return {
        success: false,
        error: formatRpcError(error.message, "Unable to apply merits. Try again."),
      };
    }
  } catch {
    return {
      success: false,
      error: "Unable to reach the server. Try again.",
      retryable: true,
    };
  }

  // Outside try...catch so NEXT_REDIRECT is never intercepted:
  revalidatePath("/student/merits-demerits-and-services");
  revalidatePath("/student");
  revalidatePath("/student/clearance");

  // Replace, so Back from the result card does not reopen the wizard. Dropping
  // ?semester= is safe: applying requires the current semester, the default view.
  redirect(`/student/merits-demerits-and-services?applied=${requestKey}`, RedirectType.replace);
}
