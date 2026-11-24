"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";

import { AccessDeniedError, requireWorkspace } from "@/server/auth/require-workspace";
import { createCommandClient } from "@/server/db/command-client";

import { allowedServiceBuckets } from "./calculations";
import type {
  CreateServiceSessionResult,
  EndServiceSessionResult,
  SetServiceParticipantsResult,
} from "./contracts";
import {
  createServiceSessionSchema,
  endServiceSessionSchema,
  setServiceParticipantsSchema,
} from "./schemas";

const RPC_MESSAGES: [string, string][] = [
  ["Service attendance is finalized", "Attendance for this service session has already been finalized and cannot be edited."],
  ["Only session issuer may finalize", "Only the instructor who created this service session can finalize it."],
  ["Valid same-duty-day completed schedule required", "The service session can only be finalized once its scheduled duty end time has passed on the duty date."],
  ["Included service attendance is incomplete or invalid", "All included participants must have complete and valid attendance timestamps before finalizing. Absent students should be marked as excluded."],
  ["Session issuer required", "Only the instructor who created this service session can update its participants."],
  ["Session issuer changed", "Only the original session creator can update or finalize this session."],
  ["Service session not found", "Service session was not found."],
  ["Invalid service attendance", "Invalid attendance timestamps. Ensure time-in and time-out fall within scheduled windows and time-out is after time-in."],
  ["Self attendance recording forbidden", "You cannot record service session attendance for yourself."],
  ["Duplicate or missing student identity", "Duplicate or invalid student in participant list."],
  ["Invalid participant batch", "Participant list must contain between 1 and 10,000 students."],
  ["Invalid participant row shape", "Invalid participant data submitted."],
  ["Duty day must belong to current academic context", "The service duty day must fall within the active semester date range."],
  ["Invalid one-day service schedule/windows", "Invalid service session schedule or time windows. Please verify your scheduled times and windows."],
  ["Matching instructor assignment required", "Only Academic Instructors (Office) or Clinical Instructors (RLE) can perform this action."],
  ["Bucket required", "Select Office Duty or Clinical (RLE) Duty."],
  ["Student enrollment in the specified semester required", "One or more selected students are not enrolled in this semester."],
  ["Activate a semester before creating academic records", "There is no active semester configured."],
  ["Request key reused", "This request was already submitted with different details. Please refresh and try again."],
  ["Active Auth-linked human actor required", "Active authorized instructor account required."],
];

function formatRpcError(
  message: string,
  fallback = "Unable to process service session request. Try again."
): string {
  return RPC_MESSAGES.find(([match]) => message.includes(match))?.[1] ?? fallback;
}

/**
 * Creates a new one-day duty service session (FL-037).
 * Atomically executes public.create_service_session RPC.
 * On success, revalidates service session routes and redirects to ?session=<sessionId>.
 */
export async function createServiceSessionAction(
  rawInput: unknown
): Promise<CreateServiceSessionResult> {
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
          ? "You are not permitted to create service sessions."
          : "Unable to verify your access. Try again.",
    };
  }

  const parsed = createServiceSessionSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Check the service session details.",
    };
  }

  const {
    requestKey,
    bucket,
    dutyOn,
    scheduledStart,
    scheduledEnd,
    location,
    lateAfterMinutes,
    timeInFrom,
    timeInUntil,
    timeOutFrom,
    timeOutUntil,
  } = parsed.data;

  const permittedBuckets = allowedServiceBuckets(userRoles);
  if (!permittedBuckets.includes(bucket)) {
    return {
      success: false,
      error: "You are not authorized to create service sessions for this duty bucket.",
    };
  }

  let sessionId: string | null = null;
  const client = createCommandClient();

  try {
    const { data, error } = await client.rpc("create_service_session", {
      p_key: requestKey,
      p_actor: actorId,
      p_bucket: bucket,
      p_duty_on: dutyOn,
      p_start: scheduledStart,
      p_end: scheduledEnd,
      p_location: (location ?? null) as unknown as string,
      p_late_after_minutes: lateAfterMinutes,
      p_time_in_from: timeInFrom,
      p_time_in_until: timeInUntil,
      p_time_out_from: timeOutFrom,
      p_time_out_until: timeOutUntil,
    });

    if (error) {
      return {
        success: false,
        error: formatRpcError(error.message, "Unable to create service session. Try again."),
      };
    }

    if (
      typeof data === "object" &&
      data !== null &&
      "session_id" in data &&
      typeof (data as { session_id: unknown }).session_id === "string"
    ) {
      sessionId = (data as { session_id: string }).session_id;
    }
  } catch {
    return {
      success: false,
      error: "Unable to reach the server. Try again.",
      retryable: true,
    };
  }

  if (!sessionId) {
    return {
      success: false,
      error: "Service session was created but no session ID was returned. Please refresh.",
    };
  }

  // Outside try...catch so NEXT_REDIRECT is not intercepted
  revalidatePath("/faculty/service-sessions");
  redirect(`/faculty/service-sessions?session=${sessionId}`, RedirectType.replace);
}

/**
 * Updates service session participants and attendance (FL-037).
 * Atomically executes public.set_service_participants RPC with upsert semantics.
 */
export async function setServiceParticipantsAction(
  rawInput: unknown
): Promise<SetServiceParticipantsResult> {
  let actorId: string;

  try {
    const access = await requireWorkspace("faculty");
    actorId = access.profile.id;
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof AccessDeniedError
          ? "You are not permitted to manage service session participants."
          : "Unable to verify your access. Try again.",
    };
  }

  const parsed = setServiceParticipantsSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Check the participant attendance details.",
    };
  }

  const { requestKey, sessionId, rows } = parsed.data;

  const pRows = rows.map((r) => ({
    student_id: r.studentId,
    time_in: r.timeIn ?? null,
    time_out: r.timeOut ?? null,
    excluded: Boolean(r.excluded),
  }));

  const client = createCommandClient();
  let updatedCount = rows.length;

  try {
    const { data, error } = await client.rpc("set_service_participants", {
      p_key: requestKey,
      p_actor: actorId,
      p_session: sessionId,
      p_rows: pRows,
    });

    if (error) {
      return {
        success: false,
        error: formatRpcError(
          error.message,
          "Unable to update service session participants. Try again."
        ),
      };
    }

    if (
      typeof data === "object" &&
      data !== null &&
      "updated_count" in data &&
      typeof (data as { updated_count: unknown }).updated_count === "number"
    ) {
      updatedCount = (data as { updated_count: number }).updated_count;
    }
  } catch {
    return {
      success: false,
      error: "Unable to reach the server. Try again.",
      retryable: true,
    };
  }

  revalidatePath("/faculty/service-sessions");
  return { success: true, updatedCount };
}

/**
 * Finalizes an ended service session atomically (FL-038).
 * Executes PostgreSQL public.end_service_session RPC:
 * - Enforces scheduled duty end time has passed on the duty date
 * - Validates all included participants have valid, completed attendance
 * - Awards 1 whole-day service credit to eligible students with positive duty debt
 * - Retains completion record for students with zero debt without issuing credit
 * - Dispatches 'service_recorded' notifications to all completed students (FL-044)
 * - Marks the session ended_at and ended_by
 *
 * On success, revalidates faculty service sessions and all affected disciplinary,
 * clearance, and notification routes across portals.
 */
export async function endServiceSessionAction(
  rawInput: unknown
): Promise<EndServiceSessionResult> {
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
          ? "You are not permitted to finalize service sessions."
          : "Unable to verify your access. Try again.",
    };
  }

  const parsed = endServiceSessionSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid session finalization request.",
    };
  }

  if (allowedServiceBuckets(userRoles).length === 0) {
    return {
      success: false,
      error: "Only Academic Instructors (Office) or Clinical Instructors (RLE) can finalize service sessions.",
    };
  }

  const { requestKey, sessionId } = parsed.data;
  const client = createCommandClient();
  let data: unknown;

  try {
    const result = await client.rpc("end_service_session", {
      p_key: requestKey,
      p_actor: actorId,
      p_session: sessionId,
    });
    data = result.data;

    if (result.error) {
      // supabase-js returns (not throws) fetch failures as an error without a Postgres code;
      // the commit may already have happened, so the same request key must be replayed.
      if (!result.error.code) {
        return {
          success: false,
          error: "Unable to reach the server. If finalization was recorded, retrying will safely return the result.",
          retryable: true,
        };
      }
      return {
        success: false,
        error: formatRpcError(result.error.message, "Unable to finalize service session. Try again."),
      };
    }
  } catch {
    return {
      success: false,
      error: "Unable to reach the server. Try again.",
      retryable: true,
    };
  }

  // The RPC committed: revalidate before inspecting the response so other pages never go stale.
  revalidatePath("/faculty/service-sessions");
  revalidatePath("/student/merits-demerits-and-services");
  revalidatePath("/student");
  revalidatePath("/student/notifications");
  revalidatePath("/student/clearance");
  revalidatePath("/council/clearance");
  revalidatePath("/faculty/academic-clearance");
  revalidatePath("/faculty/rle-clearance");
  revalidatePath("/faculty");

  const d = (data ?? {}) as Record<string, unknown>;
  const completedCount = Number(d.completed_count);
  const creditCount = Number(d.credit_count);
  if (
    typeof d.session_id !== "string" ||
    typeof d.ended_at !== "string" ||
    !Number.isFinite(completedCount) ||
    !Number.isFinite(creditCount)
  ) {
    return {
      success: false,
      error: "Service session was finalized but response data was incomplete. Please refresh.",
    };
  }

  return {
    success: true,
    sessionId: d.session_id,
    endedAt: d.ended_at,
    completedCount,
    creditCount,
  };
}

