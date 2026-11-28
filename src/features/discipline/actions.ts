"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";

import { AccessDeniedError, requireWorkspace } from "@/server/auth/require-workspace";
import { getAccessContext } from "@/server/auth/access-context";
import { createCommandClient } from "@/server/db/command-client";
import { getTodayManila, hasInstructorRole, instructorBucket } from "./calculations";
import type {
  AwardExternalCiMeritsResult,
  DecideMeritEndorsementResult,
  ExternalCiEntryFailure,
  LogExternalCiDemeritsResult,
  MeritEndorsementDecision,
  WaiveDemeritResult,
} from "./contracts";
import {
  applyMeritsSchema,
  awardDirectMeritsSchema,
  awardExternalCiMeritsSchema,
  decideMeritEndorsementSchema,
  logExternalCiDemeritsSchema,
  logFacultyDemeritsSchema,
  submitMeritEndorsementsSchema,
  waiveDemeritSchema,
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

const DECIDE_ENDORSEMENT_MESSAGES: [string, string][] = [
  ["Invalid endorsement decision", "Select Approve or Reject, and enter a non-blank reason if providing one."],
  ["Assigned instructor required", "Only the assigned instructor can decide this endorsement, and you cannot decide your own endorsement."],
  ["Endorsement already decided", "This endorsement has already been decided. Refresh to see the recorded outcome."],
  ["Matching instructor assignment required", "Only active Academic or Clinical Instructors can decide merit endorsements."],
  ["Active Auth-linked human actor required", "An active authorized instructor account is required to decide endorsements."],
  ["Commands require READ COMMITTED isolation", "Unable to record this endorsement decision. Try again."],
  ["Non-null request key/payload required", "Invalid decision request. Refresh the page and try again."],
  ["Request key reused", "This decision request was already submitted with different details. Refresh and check Endorsements before trying again."],
  ["Incomplete command receipt; inspect transaction integration", "A previous attempt did not finish cleanly. Refresh to check the current status before retrying."],
  ["Configure approved institutional timezone in f_cmd_private.settings", "The institutional timezone is not configured. Contact an administrator."],
  ["Unsupported command notification kind", "Unable to send the student notification for this award. Contact an administrator."],
  ["Command result cannot be null", "Unable to finalize this decision. Refresh to check the current status."],
  ["Missing pending command receipt", "Unable to finalize this decision. Refresh to check the current status."],
  ["Student enrollment in record semester required", "This student is no longer enrolled in the endorsement semester."],
  ["Self merit award forbidden", "You cannot approve a merit endorsement for yourself."],
  ["Invalid endorsement award", "This endorsement cannot generate merit awards in its current state. Refresh and try again."],
  ["Self endorsement forbidden", "You cannot decide a merit endorsement for yourself."],
  ["Assigned instructor must decide", "Only the assigned instructor can decide this endorsement."],
  ["merit_endorsements final decision cannot change", "This endorsement has already been decided and cannot be changed."],
  ["merit_endorsements immutable facts cannot change", "Endorsement details are locked and cannot be modified."],
  ["merit_endorsements history cannot be deleted", "Endorsement history cannot be deleted."],
  ["Endorsement decision/award units inconsistent", "The endorsement awards could not be created consistently. Try again."],
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

/**
 * Approves or rejects an assigned Council merit endorsement (FL-032).
 * Executes `public.decide_merit_endorsement` via `createCommandClient()`:
 * - Verifies active Academic or Clinical Instructor role (`f_cmd_instructor`)
 * - Locks the endorsement row (`FOR UPDATE`), verifies assignment and non-self decision
 * - On approval, creates `requested_days` merit rows once dated institutional TODAY
 *   (valid 1 year, retaining the endorsement semester) and emits `merit_received` (FL-044)
 * - Performs no pre-RPC status lookup so identical request-key retries replay cleanly
 */
export async function decideMeritEndorsementAction(
  rawInput: unknown
): Promise<DecideMeritEndorsementResult> {
  let actorId: string;
  let userRoles: string[];

  try {
    const access = await requireWorkspace("faculty");
    actorId = access.profile.id;
    userRoles = access.roles;
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof AccessDeniedError
          ? "You are not permitted to decide merit endorsements."
          : "Unable to verify your access. Try again.",
    };
  }

  if (!hasInstructorRole(userRoles)) {
    return {
      success: false,
      error: "Only active Academic or Clinical Instructors can decide merit endorsements.",
    };
  }

  const parsed = decideMeritEndorsementSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Check the endorsement decision details.",
    };
  }

  const { requestKey, endorsementId, decision, reason } = parsed.data;
  const client = createCommandClient();
  let data: unknown;

  try {
    const result = await client.rpc("decide_merit_endorsement", {
      p_key: requestKey,
      p_actor: actorId,
      p_endorsement: endorsementId,
      p_decision: decision,
      ...(reason !== null ? { p_reason: reason } : {}),
    });
    data = result.data;

    if (result.error) {
      // supabase-js returns fetch/transport failures without a Postgres code;
      // the commit may already have succeeded, so the caller must replay the same key.
      if (!result.error.code) {
        return {
          success: false,
          error:
            "Unable to reach the server. If the decision was recorded, clicking retry will safely return the result.",
          retryable: true,
        };
      }
      return {
        success: false,
        error: formatRpcError(
          result.error.message,
          "Unable to record this endorsement decision. Try again.",
          DECIDE_ENDORSEMENT_MESSAGES
        ),
      };
    }
  } catch {
    return {
      success: false,
      error: "Unable to reach the server. Try again.",
      retryable: true,
    };
  }

  // Revalidate immediately after commit and before inspecting response shape.
  revalidatePath("/faculty/merit-endorsements");
  revalidatePath("/council/merit-endorsements-and-council-demerits");
  if (decision === "approved") {
    revalidatePath("/student/merits-demerits-and-services");
    revalidatePath("/student/notifications");
    revalidatePath("/student", "layout");
  }

  const d = (data ?? {}) as Record<string, unknown>;
  const unitCount = Number(d.unit_count);
  if (
    typeof d.endorsement_id !== "string" ||
    (d.status !== "approved" && d.status !== "rejected") ||
    !Number.isFinite(unitCount)
  ) {
    return {
      success: false,
      error: "The endorsement decision was recorded, but response data was incomplete. Please refresh.",
    };
  }

  return {
    success: true,
    endorsementId: d.endorsement_id,
    status: d.status as MeritEndorsementDecision,
    unitCount,
  };
}

// Standalone waiver error map (all 23 direct, helper, and trigger exceptions of `waive_demerit`).
const WAIVE_DEMERIT_MESSAGES: [string, string][] = [
  ["Waiver reason required", "A waiver reason is required to waive a demerit."],
  ["Demerit not found", "This demerit record could not be found. Refresh to see the latest list."],
  [
    "Only original authorized issuer may waive this entry",
    "Only the instructor or RLE Coordinator who entered this demerit can waive it.",
  ],
  ["Demerit context changed", "Demerit details changed while processing. Refresh and try again."],
  ["Self demerit waiver forbidden", "You cannot waive a demerit on your own student record."],
  [
    "Demerit already waived",
    "This demerit unit has already been waived. Refresh to see the recorded waiver.",
  ],
  [
    "Waiver is not eligible at current matching balance",
    "This demerit cannot be waived because the student has no remaining outstanding balance in this bucket.",
  ],
  ["Commands require READ COMMITTED isolation", "Unable to record this waiver right now. Try again."],
  [
    "Active Auth-linked human actor required",
    "An active authorized account is required to waive demerits.",
  ],
  ["Council action not authorized", "Only active Council Executives can waive Council-generated demerits."],
  [
    "Matching instructor assignment required",
    "An active Academic Instructor (Office) or Clinical Instructor (RLE) assignment matching this bucket is required.",
  ],
  [
    "Non-null request key/payload required",
    "Invalid waiver request. Refresh the page and try again.",
  ],
  [
    "Request key reused with different command, actor or input",
    "This waiver request was already submitted with different details. Refresh and check the list before trying again.",
  ],
  [
    "Incomplete command receipt; inspect transaction integration",
    "A previous attempt did not finish cleanly. Refresh to check the current status before retrying.",
  ],
  ["Command result cannot be null", "Unable to finalize this waiver. Refresh to check the current status."],
  ["Missing pending command receipt", "Unable to finalize this waiver. Refresh to check the current status."],
  ["demerits history cannot be deleted", "Demerit history cannot be deleted."],
  ["demerits immutable facts cannot change", "Demerit details are locked and cannot be modified."],
  [
    "demerits final decision cannot change",
    "This demerit has already been waived and cannot be changed.",
  ],
  [
    "Balance mutations require READ COMMITTED",
    "Unable to verify balance eligibility right now. Try again.",
  ],
  [
    "Insufficient matching balance",
    "This demerit cannot be waived because the student has no remaining outstanding balance in this bucket.",
  ],
  ["Self waiver forbidden", "You cannot waive a demerit on your own student record."],
  [
    "Only original issuer may waive Faculty entry",
    "Only the original issuing instructor can waive this Faculty demerit.",
  ],
];

/**
 * Waives a single demerit unit with an attributable reason (FL-034).
 * Serves Faculty My entries, Faculty External CI records (T-047), and Council Conduct
 * without trusting any client-supplied workspace hint:
 * - Resolves actor authority from `getAccessContext()` (active Instructor or Council Executive)
 * - Performs zero pre-RPC `demerits` reads so identical `requestKey` retries replay cleanly
 * - Calls `public.waive_demerit`, which enforces issuer/Executive authority, non-self,
 *   unwaived state, and positive cumulative matching-bucket balance atomically
 */
export async function waiveDemeritAction(rawInput: unknown): Promise<WaiveDemeritResult> {
  const access = await getAccessContext();
  if (access.status === "error") {
    return {
      success: false,
      error: "Unable to verify your access. Try again.",
    };
  }
  if (access.status !== "ready") {
    return {
      success: false,
      error: "You are not permitted to waive demerits.",
    };
  }

  const canFacultyWaive =
    access.workspaces.includes("faculty") && hasInstructorRole(access.roles);
  const canCouncilExecutiveWaive =
    access.workspaces.includes("council") && access.councilRole === "executive";

  if (!canFacultyWaive && !canCouncilExecutiveWaive) {
    return {
      success: false,
      error: "You are not permitted to waive demerits.",
    };
  }

  const parsed = waiveDemeritSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Check the demerit waiver details.",
    };
  }

  const { requestKey, demeritId, reason } = parsed.data;
  const client = createCommandClient();
  let data: unknown;

  try {
    const result = await client.rpc("waive_demerit", {
      p_key: requestKey,
      p_actor: access.profile.id,
      p_demerit: demeritId,
      p_reason: reason,
    });
    data = result.data;

    if (result.error) {
      // supabase-js returns fetch/transport failures without a Postgres code;
      // the commit may already have succeeded, so the caller must replay the same key.
      if (!result.error.code) {
        return {
          success: false,
          error:
            "Unable to reach the server. If the waiver was recorded, clicking retry will safely return the result.",
          retryable: true,
        };
      }
      return {
        success: false,
        error: formatRpcError(
          result.error.message,
          "Unable to waive this demerit. Try again.",
          WAIVE_DEMERIT_MESSAGES
        ),
      };
    }
  } catch {
    return {
      success: false,
      error:
        "Unable to reach the server. If the waiver was recorded, clicking retry will safely return the result.",
      retryable: true,
    };
  }

  // Revalidate all affected routes immediately after commit and before inspecting response shape.
  revalidatePath("/faculty/my-merits-and-demerits");
  revalidatePath("/faculty/external-ci-records");
  revalidatePath("/council/merit-endorsements-and-council-demerits");
  revalidatePath("/student");
  revalidatePath("/student/events");
  revalidatePath("/student/merits-demerits-and-services");
  revalidatePath("/student/clearance");
  revalidatePath("/council/clearance");
  revalidatePath("/faculty/academic-clearance");
  revalidatePath("/faculty/rle-clearance");

  const d = (data ?? {}) as Record<string, unknown>;
  if (typeof d.demerit_id !== "string" || typeof d.waived_at !== "string") {
    return {
      success: false,
      error: "The demerit waiver was recorded, but response data was incomplete. Please refresh.",
    };
  }

  return {
    success: true,
    demeritId: d.demerit_id,
    waivedAt: d.waived_at,
  };
}

// External CI wording for `award_merits` exceptions; shared messages fall through to RPC_MESSAGES.
const AWARD_EXTERNAL_CI_MERITS_MESSAGES: [string, string][] = [
  [
    "External CI award requires entering RLE Coordinator and attribution",
    "An active RLE Coordinator assignment and external CI source name are required.",
  ],
  ["Self award forbidden", "You cannot record merits for yourself."],
  [
    "Positive days, description and award date required",
    "Enter at least 1 whole day, a reason, and a valid award date.",
  ],
  [
    "Award date must be in current academic context and not future",
    "The award date must fall within the current semester and cannot be in the future.",
  ],
  [
    "Matching instructor assignment required",
    "An active Clinical Instructor assignment is required to record external CI merits.",
  ],
  ["Commands require READ COMMITTED isolation", "Unable to record this external CI merit right now. Try again."],
  [
    "Active Auth-linked human actor required",
    "An active authorized faculty account is required to record external CI merits.",
  ],
  ["Non-null request key/payload required", "Invalid merit request. Refresh the page and try again."],
  [
    "Request key reused with different command, actor or input",
    "This merit request was already submitted with different details. Check External CI records before trying again.",
  ],
  [
    "Incomplete command receipt; inspect transaction integration",
    "A previous attempt did not finish cleanly. Refresh to check External CI records before retrying.",
  ],
  [
    "Configure approved institutional timezone in f_cmd_private.settings",
    "The institutional timezone is not configured. Contact an administrator.",
  ],
  [
    "Unsupported command notification kind",
    "Unable to send the student notification for this merit. Contact an administrator.",
  ],
  ["Command result cannot be null", "Unable to finalize this merit award. Refresh to check External CI records."],
  ["Missing pending command receipt", "Unable to finalize this merit award. Refresh to check External CI records."],
  ["Self merit award forbidden", "You cannot record merits for yourself."],
  ["Invalid endorsement award", "This merit entry could not be recorded in its current state. Refresh and try again."],
  [
    "Merit award group must be contiguous and share context",
    "The merit units could not be recorded consistently. Try again.",
  ],
  [
    "Incomplete merit command unit count",
    "The requested merit units could not all be recorded together. Try again.",
  ],
  ["Student enrollment in record semester required", "Not enrolled in the current semester."],
  [
    "Endorsement decision/award units inconsistent",
    "The merit units could not be finalized consistently. Try again.",
  ],
  ...RPC_MESSAGES,
];

// External CI wording for `log_demerits` exceptions; shared messages fall through to RPC_MESSAGES.
const LOG_EXTERNAL_CI_DEMERITS_MESSAGES: [string, string][] = [
  ["Bucket required", "External CI demerits must be recorded in the RLE bucket."],
  [
    "External CI entry requires RLE Coordinator",
    "An active RLE Coordinator assignment and external CI source name are required for RLE demerits.",
  ],
  ["Self disciplinary entry forbidden", "You cannot record demerits for yourself."],
  ["Positive unit count and incident date required", "Enter at least 1 whole day and a valid incident date."],
  [
    "Active misconduct option required",
    "The selected misconduct option is no longer active. Refresh and choose another option.",
  ],
  [
    "Other requires a specific incident description",
    "A specific incident description is required when Other is selected.",
  ],
  [
    "Incident date must be within current context and not future",
    "The incident date must fall within the current semester and cannot be in the future.",
  ],
  [
    "Matching instructor assignment required",
    "An active Clinical Instructor assignment is required to log RLE external CI demerits.",
  ],
  ["Commands require READ COMMITTED isolation", "Unable to record this external CI demerit right now. Try again."],
  [
    "Active Auth-linked human actor required",
    "An active authorized faculty account is required to log external CI demerits.",
  ],
  ["Non-null request key/payload required", "Invalid demerit request. Refresh the page and try again."],
  [
    "Request key reused with different command, actor or input",
    "This demerit request was already submitted with different details. Check External CI records before trying again.",
  ],
  [
    "Incomplete command receipt; inspect transaction integration",
    "A previous attempt did not finish cleanly. Refresh to check External CI records before retrying.",
  ],
  [
    "Configure approved institutional timezone in f_cmd_private.settings",
    "The institutional timezone is not configured. Contact an administrator.",
  ],
  [
    "Unsupported command notification kind",
    "Unable to send the student notification for this demerit. Contact an administrator.",
  ],
  ["Command result cannot be null", "Unable to finalize this demerit entry. Refresh to check External CI records."],
  ["Missing pending command receipt", "Unable to finalize this demerit entry. Refresh to check External CI records."],
  ["Balance mutations require READ COMMITTED", "Unable to update the student balance right now. Try again."],
  ["Insufficient matching balance", "Unable to update the student balance for this entry. Refresh and try again."],
  [
    "Demerit group must be contiguous and share context",
    "The demerit units could not be recorded consistently. Try again.",
  ],
  [
    "Incomplete demerit command unit count",
    "The requested demerit units could not all be recorded together. Try again.",
  ],
  ["Student enrollment in record semester required", "Not enrolled in the current semester."],
  ...RPC_MESSAGES,
];

const EXTERNAL_CI_RETRYABLE_ERROR =
  "Unable to reach the server. Confirming again will safely skip any already recorded.";

async function requireRleCoordinatorActor(
  deniedMessage: string
): Promise<{ ok: true; actorId: string } | { ok: false; error: string }> {
  try {
    const context = await requireWorkspace("faculty");
    if (!context.roles.includes("RLE Coordinator") || !context.roles.includes("Clinical Instructor")) {
      return { ok: false, error: deniedMessage };
    }
    return { ok: true, actorId: context.profile.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof AccessDeniedError ? deniedMessage : "Unable to verify your access. Try again.",
    };
  }
}

// Bounded parallel RPCs keep a large batch inside the server action time limit.
const RECIPIENT_CONCURRENCY = 5;

async function forEachInChunks<T>(items: T[], run: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += RECIPIENT_CONCURRENCY) {
    await Promise.all(items.slice(i, i + RECIPIENT_CONCURRENCY).map(run));
  }
}

// `f_cmd_student` allows archived students, so this read is the only archived guard.
// shortcut: not in the RPC transaction, so a student archived between this read and the RPC still
// gets the entry, and a locked retry of an already-committed entry for a since-archived student is
// reported as not recorded; move the check into the RPCs when they next change.
async function findArchivedRecipientIds(
  client: ReturnType<typeof createCommandClient>,
  studentIds: string[]
): Promise<{ ok: true; archivedIds: Set<string> } | { ok: false }> {
  try {
    const { data, error } = await client
      .from("profiles")
      .select("id")
      .in("id", studentIds)
      .eq("account_status", "archived");
    if (error || !data) return { ok: false };
    return { ok: true, archivedIds: new Set(data.map((row) => row.id)) };
  } catch {
    return { ok: false };
  }
}

/**
 * Records externally attributed whole-day merits for each student (FL-035).
 * Requires active `RLE Coordinator` + `Clinical Instructor` roles, rejects archived and self
 * recipients, runs `public.award_merits` per recipient with zero pre-RPC `merits` status lookup,
 * and emits `merit_received` student notifications (FL-044).
 */
export async function awardExternalCiMeritsAction(rawInput: unknown): Promise<AwardExternalCiMeritsResult> {
  const rejectedResult = (error: string): AwardExternalCiMeritsResult => ({
    success: false,
    error,
    awardedIds: [],
    failures: [],
  });

  const actor = await requireRleCoordinatorActor("Only RLE Coordinators can record external CI merits.");
  if (!actor.ok) return rejectedResult(actor.error);

  const parsed = awardExternalCiMeritsSchema.safeParse(rawInput);
  if (!parsed.success) {
    return rejectedResult(parsed.error.issues[0]?.message ?? "Check the external CI merit details.");
  }

  const { recipients, externalSource, days, awardedOn, description } = parsed.data;
  if (awardedOn > getTodayManila()) return rejectedResult("Award date cannot be in the future.");
  if (recipients.some((r) => r.studentId === actor.actorId)) {
    return rejectedResult("You cannot record merits for yourself.");
  }

  const client = createCommandClient();
  const archivedCheck = await findArchivedRecipientIds(
    client,
    recipients.map((r) => r.studentId)
  );
  if (!archivedCheck.ok) return rejectedResult("Unable to verify the selected students. Try again.");

  const trimmedSource = externalSource.trim();
  const trimmedDescription = description.trim();
  const awardedIds: string[] = [];
  const failures: ExternalCiEntryFailure[] = [];

  await forEachInChunks(recipients, async ({ studentId, requestKey }) => {
    if (archivedCheck.archivedIds.has(studentId)) {
      failures.push({ studentId, error: "Archived students cannot receive external CI merits." });
      return;
    }
    try {
      const { error } = await client.rpc("award_merits", {
        p_key: requestKey,
        p_actor: actor.actorId,
        p_student: studentId,
        p_days: days,
        p_description: trimmedDescription,
        p_awarded_on: awardedOn,
        p_external_source: trimmedSource,
      });
      if (error) {
        if (!error.code) {
          failures.push({ studentId, error: EXTERNAL_CI_RETRYABLE_ERROR, retryable: true });
        } else {
          failures.push({
            studentId,
            error: formatRpcError(
              error.message,
              "Unable to record this external CI merit. Try again.",
              AWARD_EXTERNAL_CI_MERITS_MESSAGES
            ),
          });
        }
      } else {
        awardedIds.push(studentId);
      }
    } catch {
      failures.push({ studentId, error: EXTERNAL_CI_RETRYABLE_ERROR, retryable: true });
    }
  });

  if (awardedIds.length) {
    revalidatePath("/faculty/external-ci-records");
    revalidatePath("/student");
    revalidatePath("/student", "layout");
    revalidatePath("/student/notifications");
    revalidatePath("/student/merits-demerits-and-services");
    revalidatePath("/student/clearance");
  }

  if (!failures.length) return { success: true, awardedIds };
  return {
    success: false,
    error: awardedIds.length
      ? "Some external CI merits were not recorded."
      : "No external CI merits were recorded.",
    awardedIds,
    failures,
  };
}

/**
 * Records externally attributed whole-day RLE demerits for each student (FL-035).
 * Requires active `RLE Coordinator` + `Clinical Instructor` roles, locks `p_bucket` to `'rle'`,
 * rejects archived and self recipients, runs `public.log_demerits` per recipient with zero pre-RPC
 * `demerits` status lookup, and emits `demerit_incurred` student notifications (FL-044).
 */
export async function logExternalCiDemeritsAction(rawInput: unknown): Promise<LogExternalCiDemeritsResult> {
  const rejectedResult = (error: string): LogExternalCiDemeritsResult => ({
    success: false,
    error,
    recordedIds: [],
    failures: [],
  });

  const actor = await requireRleCoordinatorActor("Only RLE Coordinators can log external CI demerits.");
  if (!actor.ok) return rejectedResult(actor.error);

  const parsed = logExternalCiDemeritsSchema.safeParse(rawInput);
  if (!parsed.success) {
    return rejectedResult(parsed.error.issues[0]?.message ?? "Check the external CI demerit details.");
  }

  const { recipients, externalSource, days, misconductId, incidentOn, notes } = parsed.data;
  if (incidentOn > getTodayManila()) return rejectedResult("Incident date cannot be in the future.");
  if (recipients.some((r) => r.studentId === actor.actorId)) {
    return rejectedResult("You cannot record demerits for yourself.");
  }

  const client = createCommandClient();
  const archivedCheck = await findArchivedRecipientIds(
    client,
    recipients.map((r) => r.studentId)
  );
  if (!archivedCheck.ok) return rejectedResult("Unable to verify the selected students. Try again.");

  const trimmedSource = externalSource.trim();
  const descriptionInput = notes ?? "";
  const recordedIds: string[] = [];
  const failures: ExternalCiEntryFailure[] = [];

  await forEachInChunks(recipients, async ({ studentId, requestKey }) => {
    if (archivedCheck.archivedIds.has(studentId)) {
      failures.push({ studentId, error: "Archived students cannot receive external CI demerits." });
      return;
    }
    try {
      const { error } = await client.rpc("log_demerits", {
        p_key: requestKey,
        p_actor: actor.actorId,
        p_student: studentId,
        p_bucket: "rle",
        p_days: days,
        p_misconduct: misconductId,
        p_description: descriptionInput,
        p_incident_on: incidentOn,
        p_external_source: trimmedSource,
      });
      if (error) {
        if (!error.code) {
          failures.push({ studentId, error: EXTERNAL_CI_RETRYABLE_ERROR, retryable: true });
        } else {
          failures.push({
            studentId,
            error: formatRpcError(
              error.message,
              "Unable to record this external CI demerit. Try again.",
              LOG_EXTERNAL_CI_DEMERITS_MESSAGES
            ),
          });
        }
      } else {
        recordedIds.push(studentId);
      }
    } catch {
      failures.push({ studentId, error: EXTERNAL_CI_RETRYABLE_ERROR, retryable: true });
    }
  });

  if (recordedIds.length) {
    revalidatePath("/faculty/external-ci-records");
    revalidatePath("/student");
    revalidatePath("/student", "layout");
    revalidatePath("/student/notifications");
    revalidatePath("/student/merits-demerits-and-services");
    revalidatePath("/student/clearance");
    revalidatePath("/faculty/rle-clearance");
  }

  if (!failures.length) return { success: true, recordedIds };
  return {
    success: false,
    error: recordedIds.length
      ? "Some external CI demerits were not recorded."
      : "No external CI demerits were recorded.",
    recordedIds,
    failures,
  };
}
