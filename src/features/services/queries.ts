import "server-only";

import { z } from "zod";

import { getRoster } from "@/features/students/queries";
import { displayName } from "@/lib/format-name";
import { requireWorkspace } from "@/server/auth/require-workspace";
import { createUserClient } from "@/server/db/user-client";

import {
  countServiceParticipants,
  evaluateAttendanceStatus,
  withFinalizationCounts,
} from "./calculations";
import type {
  AvailableServiceStudent,
  ServiceParticipantCredit,
  ServiceParticipantDetail,
  ServiceSessionDetail,
  ServiceSessionSummary,
} from "./contracts";

const uuidSchema = z.string().uuid();

// Explicit projections: actor columns (recorded_by, excluded_by, ended_by, issued_by, revoked_by) are not sent to the client.
const serviceSessionColumns =
  "id, semester_id, bucket, duty_on, scheduled_start, scheduled_end, location, late_after_minutes, time_in_from, time_in_until, time_out_from, time_out_until, created_by, ended_at";
const serviceParticipantColumns = "session_id, student_id, time_in, time_out, excluded_at";
const serviceCreditColumns = "id, student_id, issued_at, revoked_at, revocation_reason";
const serviceCreditSummaryColumns = "id, session_id";

/**
 * Service sessions in one semester for faculty listing.
 * - Ordinary instructors see their own sessions.
 * - Coordinators (Academic / RLE) see all semester sessions permitted by RLS.
 */
export async function getMyServiceSessions(semesterId: string): Promise<ServiceSessionSummary[]> {
  const access = await requireWorkspace("faculty");

  const parsedSemester = uuidSchema.safeParse(semesterId);
  if (!parsedSemester.success) return [];

  const client = await createUserClient();
  const isCoordinator = access.roles.includes("Academic Coordinator") || access.roles.includes("RLE Coordinator");

  let query = client
    .from("service_sessions")
    .select(serviceSessionColumns)
    .eq("semester_id", parsedSemester.data);

  if (!isCoordinator) {
    query = query.eq("created_by", access.profile.id);
  }

  const { data: sessions, error: sessionsError } = await query
    .order("duty_on", { ascending: false })
    .order("scheduled_start", { ascending: false });

  if (sessionsError) throw new Error(`Failed to load service sessions: ${sessionsError.message}`);
  if (!sessions || sessions.length === 0) return [];

  // Batch-load creator display names
  const creatorIds = [...new Set(sessions.map((s) => s.created_by))];
  const creatorNames = new Map<string, string>();
  creatorNames.set(access.profile.id, displayName(access.profile));

  const otherCreatorIds = creatorIds.filter((id) => id !== access.profile.id);
  if (otherCreatorIds.length > 0) {
    const { data: nameRows } = await client.rpc("florence_discipline_names", {
      p_ids: otherCreatorIds,
    });

    if (nameRows) {
      for (const row of nameRows) {
        creatorNames.set(row.id, displayName(row));
      }
    }
  }

  // Batch-load participants and finalized credits across sessions in parallel (no N+1)
  const sessionIds = sessions.map((s) => s.id);
  const endedSessionIds = sessions.filter((s) => s.ended_at !== null).map((s) => s.id);

  const [participantsRes, creditsRes] = await Promise.all([
    client
      .from("service_participants")
      .select(serviceParticipantColumns)
      .in("session_id", sessionIds),
    endedSessionIds.length > 0
      ? client
          .from("service_credits")
          .select(serviceCreditSummaryColumns)
          .in("session_id", endedSessionIds)
      : Promise.resolve({
          data: [] as { id: string; session_id: string }[],
          error: null,
        }),
  ]);

  if (participantsRes.error) {
    throw new Error(`Failed to load service participants: ${participantsRes.error.message}`);
  }
  if (creditsRes.error) {
    throw new Error(`Failed to load service credits: ${creditsRes.error.message}`);
  }

  const participants = participantsRes.data ?? [];
  const credits = creditsRes.data ?? [];

  const participantsBySession = new Map<string, NonNullable<typeof participants>>();
  for (const p of participants) {
    const list = participantsBySession.get(p.session_id) ?? [];
    list.push(p);
    participantsBySession.set(p.session_id, list);
  }

  const creditCountBySession = new Map<string, number>();
  for (const c of credits) {
    creditCountBySession.set(c.session_id, (creditCountBySession.get(c.session_id) ?? 0) + 1);
  }

  const nowIso = new Date().toISOString();

  return sessions.map((session) => {
    const sessionParticipants = participantsBySession.get(session.id) ?? [];
    const statuses = sessionParticipants.map((p) => evaluateAttendanceStatus(p, session, nowIso));
    const baseCounts = countServiceParticipants(statuses);
    const counts =
      session.ended_at !== null
        ? withFinalizationCounts(baseCounts, creditCountBySession.get(session.id) ?? 0)
        : baseCounts;

    return {
      ...session,
      creator_name: creatorNames.get(session.created_by) ?? null,
      participant_counts: counts,
    };
  });
}

/**
 * Detailed view of a single service session and all its participants with computed attendance.
 */
export async function getServiceSessionDetail(sessionId: string): Promise<ServiceSessionDetail | null> {
  const access = await requireWorkspace("faculty");

  const parsedId = uuidSchema.safeParse(sessionId);
  if (!parsedId.success) return null;

  const client = await createUserClient();
  const { data: session, error: sessionError } = await client
    .from("service_sessions")
    .select(serviceSessionColumns)
    .eq("id", parsedId.data)
    .maybeSingle();

  if (sessionError) throw new Error(`Failed to load service session: ${sessionError.message}`);
  if (!session) return null;

  // Load creator display name
  let creatorName = session.created_by === access.profile.id ? displayName(access.profile) : null;
  if (!creatorName) {
    const { data: nameRows } = await client.rpc("florence_discipline_names", {
      p_ids: [session.created_by],
    });

    if (nameRows && nameRows.length > 0) {
      creatorName = displayName(nameRows[0]);
    }
  }

  // Load participants, credits (if finalized), and semester roster in parallel
  const [participantsRes, creditsRes, roster] = await Promise.all([
    client
      .from("service_participants")
      .select(serviceParticipantColumns)
      .eq("session_id", session.id),
    session.ended_at !== null
      ? client
          .from("service_credits")
          .select(serviceCreditColumns)
          .eq("session_id", session.id)
      : Promise.resolve({
          data: [] as {
            id: string;
            student_id: string;
            issued_at: string;
            revoked_at: string | null;
            revocation_reason: string | null;
          }[],
          error: null,
        }),
    // No fallback: rows without names would let attendance be recorded against unidentified students.
    getRoster(session.semester_id, "faculty"),
  ]);

  if (participantsRes.error) {
    throw new Error(`Failed to load session participants: ${participantsRes.error.message}`);
  }
  if (creditsRes.error) {
    throw new Error(`Failed to load session credits: ${creditsRes.error.message}`);
  }

  const participants = participantsRes.data ?? [];
  const credits = creditsRes.data ?? [];

  const creditsByStudent = new Map<string, ServiceParticipantCredit>();
  for (const c of credits) {
    creditsByStudent.set(c.student_id, {
      id: c.id,
      issued_at: c.issued_at,
      revoked_at: c.revoked_at,
      revocation_reason: c.revocation_reason,
    });
  }

  const rosterMap = new Map(roster.map((s) => [s.student_id, s]));
  const nowIso = new Date().toISOString();

  const detailedParticipants: ServiceParticipantDetail[] = participants.map((p) => {
    const student = rosterMap.get(p.student_id);
    const status = evaluateAttendanceStatus(p, session, nowIso);
    return {
      ...p,
      university_id: student?.university_id ?? "Unknown",
      first_name: student?.first_name ?? "Unknown",
      middle_name: student?.middle_name ?? null,
      last_name: student?.last_name ?? "Student",
      suffix: student?.suffix ?? null,
      year_level: student?.year_level ?? null,
      status,
      credit: session.ended_at !== null ? (creditsByStudent.get(p.student_id) ?? null) : null,
    };
  });

  // Sort participants by surname then given name
  detailedParticipants.sort((a, b) => {
    const cmp = a.last_name.localeCompare(b.last_name);
    if (cmp !== 0) return cmp;
    return a.first_name.localeCompare(b.first_name);
  });

  const baseCounts = countServiceParticipants(detailedParticipants.map((p) => p.status));
  const participantCounts =
    session.ended_at !== null
      ? withFinalizationCounts(baseCounts, credits.length)
      : baseCounts;

  return {
    ...session,
    creator_name: creatorName,
    participant_counts: participantCounts,
    participants: detailedParticipants,
  };
}

/**
 * Enrolled students eligible to be added to a service session.
 * Excludes archived accounts, self (instructor), and already-added students.
 */
export async function getAvailableServiceStudents(
  semesterId: string,
  existingStudentIds: readonly string[] = []
): Promise<AvailableServiceStudent[]> {
  const access = await requireWorkspace("faculty");

  const parsedSemester = uuidSchema.safeParse(semesterId);
  if (!parsedSemester.success) return [];

  const roster = await getRoster(parsedSemester.data, "faculty");
  const existingSet = new Set(existingStudentIds);

  return roster
    .filter(
      (student) =>
        student.account_status !== "archived" &&
        student.student_id !== access.profile.id &&
        !existingSet.has(student.student_id)
    )
    .map((student) => ({
      student_id: student.student_id,
      university_id: student.university_id,
      first_name: student.first_name,
      middle_name: student.middle_name,
      last_name: student.last_name,
      suffix: student.suffix,
      year_level: student.year_level,
      academic_status: student.academic_status,
    }));
}
