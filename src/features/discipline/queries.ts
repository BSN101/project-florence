import "server-only";

import { displayName } from "@/lib/format-name";
import { AccessDeniedError, requireWorkspace } from "@/server/auth/require-workspace";
import { createUserClient } from "@/server/db/user-client";

import {
  calculateDisciplinarySummary,
  evaluateMeritState,
  getTodayManila,
} from "./calculations";
import type {
  CouncilDisciplinaryViewData,
  DemeritRecord,
  FacultyDisciplinaryViewData,
  MeritApplicationRecord,
  MeritEndorsementRecord,
  MeritRecord,
  ServiceCreditRecord,
  StudentDisciplinarySummary,
} from "./contracts";

/**
 * Access guard for Council disciplinary routes (FL-029).
 * Restricts access to Council Executive and Operations. Representatives are strictly denied.
 */
export async function requireCouncilDisciplinaryViewer() {
  const context = await requireWorkspace("council");
  if (context.councilRole !== "executive" && context.councilRole !== "operations") {
    throw new AccessDeniedError("forbidden");
  }
  return context;
}

/**
 * Student workspace query (FL-029).
 * Fetches own merits, demerits, applications, and service credits to calculate
 * cumulative Office/RLE balances and merit availability.
 */
export async function getMyDisciplinaryRecords(semesterId?: string): Promise<{
  summary: StudentDisciplinarySummary;
  demerits: DemeritRecord[];
  merits: MeritRecord[];
  serviceCredits: ServiceCreditRecord[];
}> {
  const access = await requireWorkspace("student");
  const studentId = access.profile.id;
  const client = await createUserClient();
  const todayManila = getTodayManila();

  // All student records across semesters are fetched to compute authoritative cumulative balances
  const [demeritsRes, meritsRes, applicationsRes, creditsRes] = await Promise.all([
    client
      .from("demerits")
      .select(`
        id,
        incident_group_id,
        incident_unit_index,
        student_id,
        semester_id,
        bucket,
        source,
        misconduct_id,
        description,
        incident_on,
        event_attendance_id,
        consequence_outcome,
        source_unit_index,
        issued_by,
        external_source_name,
        waived_at,
        waived_by,
        waiver_reason,
        created_at,
        misconduct:misconduct_catalog(label),
        issuer:profiles!demerits_issued_by_fkey(first_name, last_name),
        waived_by_profile:profiles!demerits_waived_by_fkey(first_name, last_name)
      `)
      .eq("student_id", studentId)
      .order("incident_on", { ascending: false }),

    client
      .from("merits")
      .select(`
        id,
        student_id,
        semester_id,
        source,
        endorsement_id,
        endorsement_unit_index,
        description,
        awarded_on,
        expires_on,
        awarded_by,
        external_source_name,
        created_at,
        awarder:profiles!merits_awarded_by_fkey(first_name, last_name)
      `)
      .eq("student_id", studentId)
      .order("awarded_on", { ascending: false }),

    client
      .from("merit_applications")
      .select("id, application_group_id, student_id, merit_id, bucket, applied_at")
      .eq("student_id", studentId),

    client
      .from("service_credits")
      .select(`
        id,
        student_id,
        semester_id,
        bucket,
        service_participant_id,
        issued_by,
        issued_at,
        revoked_by,
        revoked_at,
        revocation_reason,
        issuer:profiles!service_credits_issued_by_fkey(first_name, last_name)
      `)
      .eq("student_id", studentId)
      .order("issued_at", { ascending: false }),
  ]);

  if (demeritsRes.error) throw new Error("Unable to load demerits");
  if (meritsRes.error) throw new Error("Unable to load merits");
  if (applicationsRes.error) throw new Error("Unable to load merit applications");
  if (creditsRes.error) throw new Error("Unable to load service credits");

  const rawDemerits = (demeritsRes.data ?? []) as any[];
  const rawMerits = (meritsRes.data ?? []) as any[];
  const rawApplications = (applicationsRes.data ?? []) as MeritApplicationRecord[];
  const rawCredits = (creditsRes.data ?? []) as any[];

  const appliedMeritIds = new Set(rawApplications.map((a) => a.merit_id));

  const demerits: DemeritRecord[] = rawDemerits.map((d) => ({
    id: d.id,
    incident_group_id: d.incident_group_id,
    incident_unit_index: d.incident_unit_index,
    student_id: d.student_id,
    semester_id: d.semester_id,
    bucket: d.bucket,
    source: d.source,
    misconduct_id: d.misconduct_id,
    misconduct_label: d.misconduct?.label ?? null,
    description: d.description,
    incident_on: d.incident_on,
    event_attendance_id: d.event_attendance_id,
    consequence_outcome: d.consequence_outcome,
    source_unit_index: d.source_unit_index,
    issued_by: d.issued_by,
    issuer_name: d.issuer ? displayName(d.issuer) : null,
    external_source_name: d.external_source_name,
    waived_at: d.waived_at,
    waived_by: d.waived_by,
    waived_by_name: d.waived_by_profile ? displayName(d.waived_by_profile) : null,
    waiver_reason: d.waiver_reason,
    created_at: d.created_at,
  }));

  const merits: MeritRecord[] = rawMerits.map((m) => {
    const state = evaluateMeritState(m, appliedMeritIds, todayManila);
    return {
      id: m.id,
      student_id: m.student_id,
      semester_id: m.semester_id,
      source: m.source,
      endorsement_id: m.endorsement_id,
      endorsement_unit_index: m.endorsement_unit_index,
      description: m.description,
      awarded_on: m.awarded_on,
      expires_on: m.expires_on,
      awarded_by: m.awarded_by,
      awarder_name: m.awarder ? displayName(m.awarder) : null,
      external_source_name: m.external_source_name,
      created_at: m.created_at,
      isApplied: state.isApplied,
      isExpired: state.isExpired,
    };
  });

  const serviceCredits: ServiceCreditRecord[] = rawCredits.map((c) => ({
    id: c.id,
    student_id: c.student_id,
    semester_id: c.semester_id,
    bucket: c.bucket,
    service_participant_id: c.service_participant_id,
    issued_by: c.issued_by,
    issuer_name: c.issuer ? displayName(c.issuer) : null,
    issued_at: c.issued_at,
    revoked_by: c.revoked_by,
    revoked_at: c.revoked_at,
    revocation_reason: c.revocation_reason,
  }));

  const summary = calculateDisciplinarySummary({
    demerits,
    merits,
    applications: rawApplications,
    serviceCredits,
    asOfDate: todayManila,
  });

  const filteredDemerits = semesterId
    ? demerits.filter((d) => d.semester_id === semesterId)
    : demerits;
  const filteredMerits = semesterId
    ? merits.filter((m) => m.semester_id === semesterId)
    : merits;
  const filteredCredits = semesterId
    ? serviceCredits.filter((c) => c.semester_id === semesterId)
    : serviceCredits;

  return {
    summary,
    demerits: filteredDemerits,
    merits: filteredMerits,
    serviceCredits: filteredCredits,
  };
}

/**
 * Council workspace query (FL-029).
 * Scoped strictly to Council-generated demerits and Council-origin merit endorsements.
 * Entirely excludes whole-ledger Office/RLE balances, Faculty demerits, and service sessions.
 */
export async function getCouncilDisciplinaryRecords(
  semesterId: string
): Promise<CouncilDisciplinaryViewData> {
  await requireCouncilDisciplinaryViewer();
  const client = await createUserClient();

  const [demeritsRes, endorsementsRes] = await Promise.all([
    client
      .from("demerits")
      .select(`
        id,
        incident_group_id,
        incident_unit_index,
        student_id,
        semester_id,
        bucket,
        source,
        misconduct_id,
        description,
        incident_on,
        event_attendance_id,
        consequence_outcome,
        source_unit_index,
        issued_by,
        external_source_name,
        waived_at,
        waived_by,
        waiver_reason,
        created_at,
        student:profiles!demerits_student_id_fkey(first_name, last_name, university_id),
        issuer:profiles!demerits_issued_by_fkey(first_name, last_name),
        waived_by_profile:profiles!demerits_waived_by_fkey(first_name, last_name)
      `)
      .eq("source", "council")
      .eq("semester_id", semesterId)
      .order("incident_on", { ascending: false }),

    client
      .from("merit_endorsements")
      .select(`
        id,
        student_id,
        semester_id,
        assigned_instructor_id,
        description,
        requested_days,
        status,
        submitted_by,
        submitted_at,
        decided_by,
        decided_at,
        decision_reason,
        student:profiles!merit_endorsements_student_id_fkey(first_name, last_name, university_id),
        assigned_instructor:profiles!merit_endorsements_assigned_instructor_id_fkey(first_name, last_name),
        submitter:profiles!merit_endorsements_submitted_by_fkey(first_name, last_name),
        decider:profiles!merit_endorsements_decided_by_fkey(first_name, last_name)
      `)
      .eq("semester_id", semesterId)
      .order("submitted_at", { ascending: false }),
  ]);

  if (demeritsRes.error) throw new Error("Unable to load Council demerits");
  if (endorsementsRes.error) throw new Error("Unable to load merit endorsements");

  const demerits: DemeritRecord[] = (demeritsRes.data ?? []).map((d: any) => ({
    id: d.id,
    incident_group_id: d.incident_group_id,
    incident_unit_index: d.incident_unit_index,
    student_id: d.student_id,
    student_university_id: d.student?.university_id ?? null,
    student_name: d.student ? displayName(d.student) : null,
    semester_id: d.semester_id,
    bucket: d.bucket,
    source: d.source,
    misconduct_id: d.misconduct_id,
    description: d.description,
    incident_on: d.incident_on,
    event_attendance_id: d.event_attendance_id,
    consequence_outcome: d.consequence_outcome,
    source_unit_index: d.source_unit_index,
    issued_by: d.issued_by,
    issuer_name: d.issuer ? displayName(d.issuer) : null,
    external_source_name: d.external_source_name,
    waived_at: d.waived_at,
    waived_by: d.waived_by,
    waived_by_name: d.waived_by_profile ? displayName(d.waived_by_profile) : null,
    waiver_reason: d.waiver_reason,
    created_at: d.created_at,
  }));

  const endorsements: MeritEndorsementRecord[] = (endorsementsRes.data ?? []).map((e: any) => ({
    id: e.id,
    student_id: e.student_id,
    student_university_id: e.student?.university_id ?? null,
    student_name: e.student ? displayName(e.student) : null,
    semester_id: e.semester_id,
    assigned_instructor_id: e.assigned_instructor_id,
    assigned_instructor_name: e.assigned_instructor ? displayName(e.assigned_instructor) : null,
    description: e.description,
    requested_days: e.requested_days,
    status: e.status,
    submitted_by: e.submitted_by,
    submitter_name: e.submitter ? displayName(e.submitter) : null,
    submitted_at: e.submitted_at,
    decided_by: e.decided_by,
    decided_at: e.decided_at,
    decision_reason: e.decision_reason,
  }));

  return { demerits, endorsements };
}

/**
 * Faculty workspace query (FL-029).
 * Used when viewing a student in the Faculty workspace.
 * Coordinators (Academic Coordinator, RLE Coordinator) receive complete student ledger and balances.
 * Ordinary instructors receive ONLY their own issued entries and no overall ledger/balance.
 */
export async function getStudentDisciplinaryLedger(
  studentId: string,
  _semesterId?: string
): Promise<FacultyDisciplinaryViewData> {
  const access = await requireWorkspace("faculty");
  const isCoordinator =
    access.roles.includes("Academic Coordinator") || access.roles.includes("RLE Coordinator");
  const actorId = access.profile.id;
  const client = await createUserClient();
  const todayManila = getTodayManila();

  // Load student basic identity
  const { data: studentProfile, error: studentError } = await client
    .from("profiles")
    .select("id, university_id, first_name, middle_name, last_name, suffix")
    .eq("id", studentId)
    .single();

  if (studentError || !studentProfile) {
    throw new Error("Unable to find the student profile");
  }

  const student = {
    id: studentProfile.id,
    universityId: studentProfile.university_id ?? "",
    fullName: displayName(studentProfile),
  };

  if (isCoordinator) {
    // Coordinators see full records across all sources
    const [demeritsRes, meritsRes, applicationsRes, creditsRes] = await Promise.all([
      client
        .from("demerits")
        .select(`
          id,
          incident_group_id,
          incident_unit_index,
          student_id,
          semester_id,
          bucket,
          source,
          misconduct_id,
          description,
          incident_on,
          event_attendance_id,
          consequence_outcome,
          source_unit_index,
          issued_by,
          external_source_name,
          waived_at,
          waived_by,
          waiver_reason,
          created_at,
          misconduct:misconduct_catalog(label),
          issuer:profiles!demerits_issued_by_fkey(first_name, last_name),
          waived_by_profile:profiles!demerits_waived_by_fkey(first_name, last_name)
        `)
        .eq("student_id", studentId)
        .order("incident_on", { ascending: false }),

      client
        .from("merits")
        .select(`
          id,
          student_id,
          semester_id,
          source,
          endorsement_id,
          endorsement_unit_index,
          description,
          awarded_on,
          expires_on,
          awarded_by,
          external_source_name,
          created_at,
          awarder:profiles!merits_awarded_by_fkey(first_name, last_name)
        `)
        .eq("student_id", studentId)
        .order("awarded_on", { ascending: false }),

      client
        .from("merit_applications")
        .select("id, application_group_id, student_id, merit_id, bucket, applied_at")
        .eq("student_id", studentId),

      client
        .from("service_credits")
        .select(`
          id,
          student_id,
          semester_id,
          bucket,
          service_participant_id,
          issued_by,
          issued_at,
          revoked_by,
          revoked_at,
          revocation_reason,
          issuer:profiles!service_credits_issued_by_fkey(first_name, last_name)
        `)
        .eq("student_id", studentId)
        .order("issued_at", { ascending: false }),
    ]);

    if (demeritsRes.error) throw new Error("Unable to load demerits");
    if (meritsRes.error) throw new Error("Unable to load merits");
    if (applicationsRes.error) throw new Error("Unable to load merit applications");
    if (creditsRes.error) throw new Error("Unable to load service credits");

    const rawDemerits = (demeritsRes.data ?? []) as any[];
    const rawMerits = (meritsRes.data ?? []) as any[];
    const rawApplications = (applicationsRes.data ?? []) as MeritApplicationRecord[];
    const rawCredits = (creditsRes.data ?? []) as any[];

    const appliedMeritIds = new Set(rawApplications.map((a) => a.merit_id));

    const demerits: DemeritRecord[] = rawDemerits.map((d) => ({
      id: d.id,
      incident_group_id: d.incident_group_id,
      incident_unit_index: d.incident_unit_index,
      student_id: d.student_id,
      semester_id: d.semester_id,
      bucket: d.bucket,
      source: d.source,
      misconduct_id: d.misconduct_id,
      misconduct_label: d.misconduct?.label ?? null,
      description: d.description,
      incident_on: d.incident_on,
      event_attendance_id: d.event_attendance_id,
      consequence_outcome: d.consequence_outcome,
      source_unit_index: d.source_unit_index,
      issued_by: d.issued_by,
      issuer_name: d.issuer ? displayName(d.issuer) : null,
      external_source_name: d.external_source_name,
      waived_at: d.waived_at,
      waived_by: d.waived_by,
      waived_by_name: d.waived_by_profile ? displayName(d.waived_by_profile) : null,
      waiver_reason: d.waiver_reason,
      created_at: d.created_at,
    }));

    const merits: MeritRecord[] = rawMerits.map((m) => {
      const state = evaluateMeritState(m, appliedMeritIds, todayManila);
      return {
        id: m.id,
        student_id: m.student_id,
        semester_id: m.semester_id,
        source: m.source,
        endorsement_id: m.endorsement_id,
        endorsement_unit_index: m.endorsement_unit_index,
        description: m.description,
        awarded_on: m.awarded_on,
        expires_on: m.expires_on,
        awarded_by: m.awarded_by,
        awarder_name: m.awarder ? displayName(m.awarder) : null,
        external_source_name: m.external_source_name,
        created_at: m.created_at,
        isApplied: state.isApplied,
        isExpired: state.isExpired,
      };
    });

    const serviceCredits: ServiceCreditRecord[] = rawCredits.map((c) => ({
      id: c.id,
      student_id: c.student_id,
      semester_id: c.semester_id,
      bucket: c.bucket,
      service_participant_id: c.service_participant_id,
      issued_by: c.issued_by,
      issuer_name: c.issuer ? displayName(c.issuer) : null,
      issued_at: c.issued_at,
      revoked_by: c.revoked_by,
      revoked_at: c.revoked_at,
      revocation_reason: c.revocation_reason,
    }));

    const summary = calculateDisciplinarySummary({
      demerits,
      merits,
      applications: rawApplications,
      serviceCredits,
      asOfDate: todayManila,
    });

    return {
      isCoordinator: true,
      student,
      summary,
      demerits,
      merits,
      serviceCredits,
    };
  }

  // Non-coordinator instructors see ONLY entries they personally issued (FL-029)
  const [demeritsRes, meritsRes, creditsRes] = await Promise.all([
    client
      .from("demerits")
      .select(`
        id,
        incident_group_id,
        incident_unit_index,
        student_id,
        semester_id,
        bucket,
        source,
        misconduct_id,
        description,
        incident_on,
        event_attendance_id,
        consequence_outcome,
        source_unit_index,
        issued_by,
        external_source_name,
        waived_at,
        waived_by,
        waiver_reason,
        created_at,
        misconduct:misconduct_catalog(label),
        issuer:profiles!demerits_issued_by_fkey(first_name, last_name),
        waived_by_profile:profiles!demerits_waived_by_fkey(first_name, last_name)
      `)
      .eq("student_id", studentId)
      .eq("issued_by", actorId)
      .order("incident_on", { ascending: false }),

    client
      .from("merits")
      .select(`
        id,
        student_id,
        semester_id,
        source,
        endorsement_id,
        endorsement_unit_index,
        description,
        awarded_on,
        expires_on,
        awarded_by,
        external_source_name,
        created_at,
        awarder:profiles!merits_awarded_by_fkey(first_name, last_name)
      `)
      .eq("student_id", studentId)
      .eq("awarded_by", actorId)
      .order("awarded_on", { ascending: false }),

    client
      .from("service_credits")
      .select(`
        id,
        student_id,
        semester_id,
        bucket,
        service_participant_id,
        issued_by,
        issued_at,
        revoked_by,
        revoked_at,
        revocation_reason,
        issuer:profiles!service_credits_issued_by_fkey(first_name, last_name)
      `)
      .eq("student_id", studentId)
      .eq("issued_by", actorId)
      .order("issued_at", { ascending: false }),
  ]);

  if (demeritsRes.error) throw new Error("Unable to load instructor demerits");
  if (meritsRes.error) throw new Error("Unable to load instructor merits");
  if (creditsRes.error) throw new Error("Unable to load instructor service credits");

  const demerits: DemeritRecord[] = (demeritsRes.data ?? []).map((d: any) => ({
    id: d.id,
    incident_group_id: d.incident_group_id,
    incident_unit_index: d.incident_unit_index,
    student_id: d.student_id,
    semester_id: d.semester_id,
    bucket: d.bucket,
    source: d.source,
    misconduct_id: d.misconduct_id,
    misconduct_label: d.misconduct?.label ?? null,
    description: d.description,
    incident_on: d.incident_on,
    event_attendance_id: d.event_attendance_id,
    consequence_outcome: d.consequence_outcome,
    source_unit_index: d.source_unit_index,
    issued_by: d.issued_by,
    issuer_name: d.issuer ? displayName(d.issuer) : null,
    external_source_name: d.external_source_name,
    waived_at: d.waived_at,
    waived_by: d.waived_by,
    waived_by_name: d.waived_by_profile ? displayName(d.waived_by_profile) : null,
    waiver_reason: d.waiver_reason,
    created_at: d.created_at,
  }));

  const merits: MeritRecord[] = (meritsRes.data ?? []).map((m: any) => ({
    id: m.id,
    student_id: m.student_id,
    semester_id: m.semester_id,
    source: m.source,
    endorsement_id: m.endorsement_id,
    endorsement_unit_index: m.endorsement_unit_index,
    description: m.description,
    awarded_on: m.awarded_on,
    expires_on: m.expires_on,
    awarded_by: m.awarded_by,
    awarder_name: m.awarder ? displayName(m.awarder) : null,
    external_source_name: m.external_source_name,
    created_at: m.created_at,
  }));

  const serviceCredits: ServiceCreditRecord[] = (creditsRes.data ?? []).map((c: any) => ({
    id: c.id,
    student_id: c.student_id,
    semester_id: c.semester_id,
    bucket: c.bucket,
    service_participant_id: c.service_participant_id,
    issued_by: c.issued_by,
    issuer_name: c.issuer ? displayName(c.issuer) : null,
    issued_at: c.issued_at,
    revoked_by: c.revoked_by,
    revoked_at: c.revoked_at,
    revocation_reason: c.revocation_reason,
  }));

  return {
    isCoordinator: false,
    student,
    summary: null, // Ordinary instructors do not see whole-ledger balances
    demerits,
    merits,
    serviceCredits,
  };
}
