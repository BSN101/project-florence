"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";

import { AccessDeniedError, requireWorkspace } from "@/server/auth/require-workspace";
import { createCommandClient } from "@/server/db/command-client";

import { allowedServiceBuckets } from "./calculations";
import type { CreateServiceSessionResult, SetServiceParticipantsResult } from "./contracts";
import { createServiceSessionSchema, setServiceParticipantsSchema } from "./schemas";

const RPC_MESSAGES: [string, string][] = [
  ["Service attendance is finalized", "Attendance for this service session has already been finalized and cannot be edited."],
  ["Session issuer required", "Only the instructor who created this service session can update its participants."],
  ["Session issuer changed", "Only the original session creator can update participants."],
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
