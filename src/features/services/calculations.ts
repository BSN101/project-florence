import type {
  AttendanceStatus,
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
