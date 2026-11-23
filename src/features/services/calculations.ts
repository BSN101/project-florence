import type {
  AttendanceStatus,
  FinalizationEligibility,
  ServiceBucket,
  ServiceParticipantRecord,
  ServiceSessionParticipantCounts,
  ServiceSessionRecord,
} from "./contracts";

/**
 * Returns today's calendar date in Asia/Manila timezone (YYYY-MM-DD).
 */
export function getTodayManila(now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
}

/**
 * Returns the permitted service duty buckets for an actor based on assigned roles.
 * - Academic Instructor -> "office"
 * - Clinical Instructor -> "rle"
 * Dual-role instructors receive both buckets, enabling explicit selection.
 */
export function allowedServiceBuckets(roles: readonly string[]): ServiceBucket[] {
  const buckets: ServiceBucket[] = [];
  if (roles.includes("Academic Instructor")) {
    buckets.push("office");
  }
  if (roles.includes("Clinical Instructor")) {
    buckets.push("rle");
  }
  return buckets;
}

/**
 * Single source of truth for whether an actor may create a service session.
 * Requires viewing the current active semester and holding at least one instructor role.
 */
export function canCreateServiceSession(
  roles: readonly string[],
  isCurrentSemester: boolean
): boolean {
  return isCurrentSemester && allowedServiceBuckets(roles).length > 0;
}

/**
 * Single source of truth for whether an actor may edit participants/attendance in a session.
 * Enforces ownership (created_by === actorId), open status (ended_at === null),
 * and current semester context.
 */
export function canManageSession(
  session: Pick<ServiceSessionRecord, "created_by" | "ended_at">,
  actorId: string,
  isCurrentSemester: boolean
): boolean {
  return isCurrentSemester && session.created_by === actorId && session.ended_at === null;
}

/**
 * Single source of truth for whether an actor may initiate finalization for a service session.
 * Mirrors PostgreSQL end_service_session requirements verbatim:
 * - Session must still be open (ended_at === null)
 * - Actor must be the session creator (created_by === actorId)
 * - Actor must hold the matching instructor role for session.bucket (mirrors f_cmd_instructor)
 * - Clock time (nowIso) must be at or after the scheduled end time (scheduled_end)
 * Note: does not require current semester context, matching SQL.
 */
export function canEndServiceSession(
  session: Pick<ServiceSessionRecord, "created_by" | "ended_at" | "bucket" | "scheduled_end">,
  actorId: string,
  roles: readonly string[],
  nowIso: string
): boolean {
  if (session.ended_at !== null) return false;
  if (session.created_by !== actorId) return false;
  if (!allowedServiceBuckets(roles).includes(session.bucket)) return false;

  const nowMs = Date.parse(nowIso);
  const scheduledEndMs = Date.parse(session.scheduled_end);
  if (Number.isNaN(nowMs) || Number.isNaN(scheduledEndMs)) return false;

  return nowMs >= scheduledEndMs;
}

/**
 * Combines a calendar duty date ("YYYY-MM-DD") and a 24-hour time string ("HH:mm" or "HH:mm:ss")
 * into a deterministic ISO 8601 string anchored strictly to Philippine Standard Time (+08:00).
 * Prevents client machine/browser timezone offsets from shifting duty times across midnight.
 */
export function combineDateAndTimeManila(dutyOn: string, timeHHmm: string): string {
  const trimmedDate = dutyOn.trim();
  const trimmedTime = timeHHmm.trim();
  const timeWithSeconds = trimmedTime.length === 5 ? `${trimmedTime}:00` : trimmedTime;
  return `${trimmedDate}T${timeWithSeconds}+08:00`;
}

/**
 * Extracts 24-hour "HH:mm" in Asia/Manila (+08:00) from an ISO timestamp.
 * Suitable for populating HTML <input type="time" /> values cleanly.
 */
export function extractTimeHHmmManila(timestampIso: string): string {
  const ms = Date.parse(timestampIso);
  if (Number.isNaN(ms)) return "";
  // Asia/Manila is UTC+8 with no daylight saving time.
  const manilaDate = new Date(ms + 8 * 60 * 60 * 1000);
  const hh = String(manilaDate.getUTCHours()).padStart(2, "0");
  const mm = String(manilaDate.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Checks whether an ISO timestamp falls inclusively within a start and end window,
 * and optionally verifies that the timestamp is not in the future relative to nowIso.
 * Strictly mirrors PostgreSQL set_service_participants window checks:
 *   time_in between s.time_in_from and s.time_in_until and time_in <= clock_timestamp()
 */
export function isTimeWithinWindow(
  timestampIso: string,
  windowFromIso: string,
  windowUntilIso: string,
  nowIso?: string
): boolean {
  const time = Date.parse(timestampIso);
  const from = Date.parse(windowFromIso);
  const until = Date.parse(windowUntilIso);

  if (Number.isNaN(time) || Number.isNaN(from) || Number.isNaN(until)) {
    return false;
  }

  if (time < from || time > until) {
    return false;
  }

  if (nowIso !== undefined) {
    const now = Date.parse(nowIso);
    if (!Number.isNaN(now) && time > now) {
      return false;
    }
  }

  return true;
}

/**
 * Pure evaluation of participant attendance status matching PostgreSQL set_service_participants
 * and end_service_session boundary rules.
 *
 * An explicit nowIso parameter avoids non-deterministic Date.now() calls during SSR and tests.
 */
export function evaluateAttendanceStatus(
  participant: Pick<ServiceParticipantRecord, "time_in" | "time_out" | "excluded_at">,
  session: Pick<
    ServiceSessionRecord,
    "scheduled_start" | "late_after_minutes" | "time_out_until" | "ended_at"
  >,
  nowIso?: string
): AttendanceStatus {
  // 1. Excluded participants are marked excluded regardless of entered timestamps
  if (participant.excluded_at !== null) {
    return "excluded";
  }

  const hasTimeIn = participant.time_in !== null;
  const hasTimeOut = participant.time_out !== null;

  // 2. No attendance recorded
  if (!hasTimeIn && !hasTimeOut) {
    return "not_recorded";
  }

  // 3. Time-out present without time-in (invalid state)
  if (!hasTimeIn && hasTimeOut) {
    return "missing_time_in";
  }

  // 4. Time-in recorded, time-out missing
  if (hasTimeIn && !hasTimeOut) {
    const isEnded = session.ended_at !== null;
    const isTimeOutWindowPassed =
      nowIso !== undefined && Date.parse(nowIso) > Date.parse(session.time_out_until);

    if (isEnded || isTimeOutWindowPassed) {
      return "missing_time_out";
    }

    return "in_progress";
  }

  // 5. Both time-in and time-out recorded: evaluate on-time vs late
  const timeInMs = Date.parse(participant.time_in!);
  const scheduledStartMs = Date.parse(session.scheduled_start);
  const lateGraceMs = session.late_after_minutes * 60 * 1000;
  const lateThresholdMs = scheduledStartMs + lateGraceMs;

  if (timeInMs <= lateThresholdMs) {
    return "present_on_time";
  }

  return "late";
}

/**
 * Aggregates a list of attendance statuses into a complete counts breakdown.
 */
export function countServiceParticipants(
  statuses: readonly AttendanceStatus[]
): ServiceSessionParticipantCounts {
  const counts: ServiceSessionParticipantCounts = {
    total: statuses.length,
    presentOnTime: 0,
    late: 0,
    inProgress: 0,
    missingTimeIn: 0,
    missingTimeOut: 0,
    notRecorded: 0,
    excluded: 0,
  };

  for (const status of statuses) {
    switch (status) {
      case "present_on_time":
        counts.presentOnTime++;
        break;
      case "late":
        counts.late++;
        break;
      case "in_progress":
        counts.inProgress++;
        break;
      case "missing_time_in":
        counts.missingTimeIn++;
        break;
      case "missing_time_out":
        counts.missingTimeOut++;
        break;
      case "not_recorded":
        counts.notRecorded++;
        break;
      case "excluded":
        counts.excluded++;
        break;
    }
  }

  return counts;
}

/**
 * Evaluates whether an included participant's attendance record satisfies all
 * finalization conditions in PostgreSQL end_service_session (line 877):
 * - student_id !== session.created_by (self-attendance forbidden)
 * - time_in and time_out are non-null
 * - time_in falls within [time_in_from, time_in_until] and is not in the future
 * - time_out falls within [time_out_from, time_out_until] and is not in the future
 * - time_out > time_in
 *
 * Excluded participants (excluded_at !== null) do not block finalization and are not evaluated here.
 * Per FL-038, lateness never denies service credit or completion.
 */
export function isParticipantFinalizationValid(
  participant: Pick<ServiceParticipantRecord, "student_id" | "time_in" | "time_out">,
  session: Pick<
    ServiceSessionRecord,
    "created_by" | "time_in_from" | "time_in_until" | "time_out_from" | "time_out_until"
  >,
  nowIso: string
): boolean {
  if (participant.student_id === session.created_by) {
    return false;
  }

  if (participant.time_in === null || participant.time_out === null) {
    return false;
  }

  const isTimeInValid = isTimeWithinWindow(
    participant.time_in,
    session.time_in_from,
    session.time_in_until,
    nowIso
  );
  if (!isTimeInValid) {
    return false;
  }

  const isTimeOutValid = isTimeWithinWindow(
    participant.time_out,
    session.time_out_from,
    session.time_out_until,
    nowIso
  );
  if (!isTimeOutValid) {
    return false;
  }

  const inMs = Date.parse(participant.time_in);
  const outMs = Date.parse(participant.time_out);
  if (Number.isNaN(inMs) || Number.isNaN(outMs) || outMs <= inMs) {
    return false;
  }

  return true;
}

/**
 * Comprehensive eligibility evaluation for ending a service session.
 * Evaluates counts and returns actionable blocking reasons in priority order:
 * 1. Session already ended
 * 2. Not the session creator
 * 3. Missing matching active instructor role for bucket
 * 4. Scheduled end not yet reached
 * 5. One or more included participants have incomplete or invalid attendance
 *
 * If there are 0 included participants (0 total or all excluded), finalization is permitted
 * when all guards above pass, matching PostgreSQL end_service_session.
 */
export function evaluateFinalizationEligibility(
  session: Pick<
    ServiceSessionRecord,
    | "created_by"
    | "ended_at"
    | "bucket"
    | "scheduled_end"
    | "time_in_from"
    | "time_in_until"
    | "time_out_from"
    | "time_out_until"
  >,
  participants: readonly Pick<
    ServiceParticipantRecord,
    "student_id" | "time_in" | "time_out" | "excluded_at"
  >[],
  actorId: string,
  roles: readonly string[],
  nowIso: string
): FinalizationEligibility {
  const totalCount = participants.length;
  let excludedCount = 0;
  let completedCount = 0;
  let incompleteCount = 0;

  for (const p of participants) {
    if (p.excluded_at !== null) {
      excludedCount++;
      continue;
    }

    if (isParticipantFinalizationValid(p, session, nowIso)) {
      completedCount++;
    } else {
      incompleteCount++;
    }
  }

  const nowMs = Date.parse(nowIso);
  const scheduledEndMs = Date.parse(session.scheduled_end);
  const isPastScheduledEnd =
    !Number.isNaN(nowMs) && !Number.isNaN(scheduledEndMs) && nowMs >= scheduledEndMs;

  let reason: string | null = null;
  if (session.ended_at !== null) {
    reason = "Service session has already been finalized.";
  } else if (session.created_by !== actorId) {
    reason = "Only the instructor who created this service session may finalize it.";
  } else if (!allowedServiceBuckets(roles).includes(session.bucket)) {
    reason = `An active instructor assignment for the ${session.bucket === "office" ? "Office" : "RLE"} track is required.`;
  } else if (!isPastScheduledEnd) {
    reason = `Session is still in progress. Finalization opens at scheduled end (${extractTimeHHmmManila(session.scheduled_end)}).`;
  } else if (incompleteCount > 0) {
    reason = `${incompleteCount} included participant${incompleteCount === 1 ? " has" : "s have"} incomplete or invalid attendance timestamps.`;
  }

  return {
    canFinalize: reason === null,
    reason,
    completedCount,
    incompleteCount,
    excludedCount,
    totalCount,
    isPastScheduledEnd,
  };
}

/**
 * Augments participant counts with post-finalization credit and completion tallies.
 * - completedCount: presentOnTime + late (lateness never denies completion)
 * - creditCount: total service credits issued upon finalization
 * - zeroCreditCount: completed participants who received 0 credit due to zero initial debt
 *
 * Treats any participant with an issued service_credits row as having received a credit
 * at finalization, even if subsequently revoked, per schema section 10.3.
 */
export function withFinalizationCounts(
  counts: ServiceSessionParticipantCounts,
  issuedCreditCount: number
): ServiceSessionParticipantCounts {
  const completedCount = counts.presentOnTime + counts.late;
  const creditCount = issuedCreditCount;
  const zeroCreditCount = Math.max(0, completedCount - issuedCreditCount);

  return {
    ...counts,
    completedCount,
    creditCount,
    zeroCreditCount,
  };
}
