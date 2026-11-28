import type {
  AvailableMerit,
  BucketDisciplinaryBalance,
  DemeritRecord,
  DisciplinaryBucket,
  FacultyEndorsementCounts,
  FacultyMeritEndorsementRecord,
  MeritApplicationRecord,
  MeritRecord,
  ServiceCreditRecord,
  StudentDisciplinarySummary,
} from "./contracts";

// Council actors are students; display "Council" instead of their names. `issued_by` /
// `waived_by` / `submitted_by` still carry the actual actors for attribution.
export const COUNCIL = "Council";

/** Actor ids whose names a demerit row displays (none for Council rows). */
export const demeritActors = (d: { source: string; issued_by: string; waived_by: string | null }) =>
  d.source === "council" ? [] : [d.issued_by, d.waived_by];

/** Whether a student may open the apply-merits wizard (optionally for one bucket). */
export function canApplyMerits(
  summary: StudentDisciplinarySummary,
  availableMeritCount: number,
  canAct: boolean,
  bucket?: DisciplinaryBucket
): boolean {
  const hasDebt = bucket ? summary[bucket].balance > 0 : summary.hasOutstandingDebt;
  return canAct && availableMeritCount > 0 && hasDebt;
}

/** The bucket a faculty member logs demerits in; access policy allows only one instructor role. */
export function instructorBucket(roles: readonly string[]): DisciplinaryBucket | null {
  if (roles.includes("Academic Instructor")) return "office";
  if (roles.includes("Clinical Instructor")) return "rle";
  return null;
}

/**
 * Returns the current date in YYYY-MM-DD formatted for Asia/Manila.
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
 * The expiry date `award_merits` stores: `(awarded_on + interval '1 year')::date`, so 29 Feb becomes 28 Feb.
 */
export function meritExpiryDate(awardedOn: string): string {
  const [year, month, day] = awardedOn.split("-").map(Number);
  const next = new Date(Date.UTC(year + 1, month - 1, day));
  if (next.getUTCMonth() !== month - 1) next.setUTCDate(0);
  return next.toISOString().slice(0, 10);
}

/**
 * Calculates a bucket balance (Office or RLE).
 * 100% consistent with PostgreSQL `public.f_cmd_balance` in 20261107050430_florence_commands.sql:
 *
 *   count(*) from demerits where waived_at is null
 *   - count(*) from merit_applications
 *   - count(*) from service_credits where revoked_at is null
 *
 * Balances are cumulative across all semesters (no semester filter).
 * Returns the signed difference (matching PostgreSQL's bigint return without a zero floor).
 */
export function calculateBucketBalance(input: {
  demerits: Pick<DemeritRecord, "bucket" | "waived_at">[];
  applications: Pick<MeritApplicationRecord, "bucket">[];
  serviceCredits: Pick<ServiceCreditRecord, "bucket" | "revoked_at">[];
  bucket: DisciplinaryBucket;
}): number {
  const activeDemerits = input.demerits.filter(
    (d) => d.bucket === input.bucket && d.waived_at === null
  ).length;

  const appliedMerits = input.applications.filter(
    (a) => a.bucket === input.bucket
  ).length;

  const activeCredits = input.serviceCredits.filter(
    (c) => c.bucket === input.bucket && c.revoked_at === null
  ).length;

  return activeDemerits - appliedMerits - activeCredits;
}

/**
 * Computes detailed balance statistics for a specific bucket.
 */
export function getBucketDisciplinaryBalance(input: {
  demerits: Pick<DemeritRecord, "bucket" | "waived_at">[];
  applications: Pick<MeritApplicationRecord, "bucket">[];
  serviceCredits: Pick<ServiceCreditRecord, "bucket" | "revoked_at">[];
  bucket: DisciplinaryBucket;
}): BucketDisciplinaryBalance {
  const bucketDemerits = input.demerits.filter((d) => d.bucket === input.bucket);
  const totalDemerits = bucketDemerits.length;
  const waivedDemerits = bucketDemerits.filter((d) => d.waived_at !== null).length;
  const activeDemerits = totalDemerits - waivedDemerits;

  const appliedMerits = input.applications.filter((a) => a.bucket === input.bucket).length;

  const bucketCredits = input.serviceCredits.filter((c) => c.bucket === input.bucket);
  const revokedServiceCredits = bucketCredits.filter((c) => c.revoked_at !== null).length;
  const activeServiceCredits = bucketCredits.length - revokedServiceCredits;

  const balance = activeDemerits - appliedMerits - activeServiceCredits;

  return {
    bucket: input.bucket,
    totalDemerits,
    waivedDemerits,
    activeDemerits,
    appliedMerits,
    activeServiceCredits,
    revokedServiceCredits,
    balance,
  };
}

/**
 * Evaluates merit validity and consumption against a given date in Asia/Manila.
 */
export function evaluateMeritState(
  merit: Pick<MeritRecord, "id" | "awarded_on" | "expires_on">,
  appliedMeritIds: Set<string>,
  todayManila: string
): { isApplied: boolean; isExpired: boolean; isAvailable: boolean } {
  const isApplied = appliedMeritIds.has(merit.id);
  // An award is expired if current Manila date is >= expires_on (expires_on is the exclusive end date in f_cmd_balance)
  const isExpired = !isApplied && merit.expires_on <= todayManila;
  // Available only if awarded on or before today, unexpired, and not applied
  const isAvailable = !isApplied && !isExpired && merit.awarded_on <= todayManila;

  return { isApplied, isExpired, isAvailable };
}

/**
 * Returns unexpired, unapplied merit units sorted earliest-expiring first (FIFO),
 * strictly mirroring PostgreSQL `public.apply_merits` (20261107050430_florence_commands.sql, lines 730-733):
 *
 *   SELECT m.id, m.expires_on FROM public.merits m
 *   WHERE m.student_id = p_actor
 *     AND m.awarded_on <= v_today
 *     AND m.expires_on > v_today
 *     AND NOT EXISTS (SELECT 1 FROM public.merit_applications a WHERE a.merit_id = m.id)
 *   ORDER BY m.expires_on ASC, m.id ASC
 *
 * Evaluated against Manila calendar day. Maps each row to clean AvailableMerit
 * so extra server fields don't leak into client component props.
 */
export function getAvailableMeritsFifo(
  merits: readonly AvailableMerit[],
  appliedMeritIds: ReadonlySet<string>,
  todayManila: string
): AvailableMerit[] {
  return merits
    .filter(
      (m) =>
        m.awarded_on <= todayManila &&
        m.expires_on > todayManila &&
        !appliedMeritIds.has(m.id)
    )
    .map((m) => ({
      id: m.id,
      awarded_on: m.awarded_on,
      expires_on: m.expires_on,
      description: m.description,
    }))
    .sort((a, b) => {
      if (a.expires_on !== b.expires_on) {
        return a.expires_on < b.expires_on ? -1 : 1;
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

/**
 * Calculates a complete disciplinary summary for a student across Office and RLE buckets,
 * including merit availability and cumulative debt.
 */
export function calculateDisciplinarySummary(input: {
  demerits: Pick<DemeritRecord, "bucket" | "waived_at">[];
  merits: Pick<MeritRecord, "id" | "awarded_on" | "expires_on">[];
  applications: Pick<MeritApplicationRecord, "bucket" | "merit_id">[];
  serviceCredits: Pick<ServiceCreditRecord, "bucket" | "revoked_at">[];
  asOfDate?: string; // YYYY-MM-DD
}): StudentDisciplinarySummary {
  const today = input.asOfDate ?? getTodayManila();
  const appliedMeritIds = new Set(input.applications.map((a) => a.merit_id));

  const office = getBucketDisciplinaryBalance({
    demerits: input.demerits,
    applications: input.applications,
    serviceCredits: input.serviceCredits,
    bucket: "office",
  });

  const rle = getBucketDisciplinaryBalance({
    demerits: input.demerits,
    applications: input.applications,
    serviceCredits: input.serviceCredits,
    bucket: "rle",
  });

  let totalApplied = 0;
  let available = 0;
  let expired = 0;

  for (const m of input.merits) {
    const state = evaluateMeritState(m, appliedMeritIds, today);
    if (state.isApplied) {
      totalApplied++;
    } else if (state.isAvailable) {
      available++;
    } else if (state.isExpired) {
      expired++;
    }
  }

  const totalActiveDemerits = office.activeDemerits + rle.activeDemerits;
  const totalActiveBalance = Math.max(0, office.balance) + Math.max(0, rle.balance);
  const hasOutstandingDebt = office.balance > 0 || rle.balance > 0;

  return {
    office,
    rle,
    merits: {
      totalAwarded: input.merits.length,
      totalApplied,
      available,
      expired,
    },
    totalActiveDemerits,
    totalActiveBalance,
    hasOutstandingDebt,
  };
}

/** True when the actor holds an active Academic or Clinical Instructor role (matches `f_cmd_instructor`). */
export function hasInstructorRole(roles: readonly string[]): boolean {
  return roles.includes("Academic Instructor") || roles.includes("Clinical Instructor");
}

/**
 * Pure eligibility check for deciding a Council merit endorsement (FL-032).
 * Mirrors `public.decide_merit_endorsement` 1:1 (semester-agnostic; pending only; assigned instructor only; no self-decision).
 */
export function canDecideMeritEndorsement(
  endorsement: { status: string; assigned_instructor_id: string; student_id: string },
  actorId: string,
  roles: readonly string[]
): boolean {
  return (
    endorsement.status === "pending" &&
    hasInstructorRole(roles) &&
    endorsement.assigned_instructor_id === actorId &&
    endorsement.student_id !== actorId
  );
}

/** Counts pending, approved, and rejected endorsements for the Faculty Endorsements summary strip. */
export function countFacultyEndorsements(
  endorsements: readonly Pick<FacultyMeritEndorsementRecord, "status">[]
): FacultyEndorsementCounts {
  let pending = 0;
  let approved = 0;
  let rejected = 0;
  for (const e of endorsements) {
    if (e.status === "pending") pending++;
    else if (e.status === "approved") approved++;
    else if (e.status === "rejected") rejected++;
  }
  return { pending, approved, rejected };
}

/** Pending endorsement counts per semester, in `semesters` order; semesters with none are left out. */
export function countPendingBySemester<T extends { id: string }>(
  rows: readonly { semester_id: string }[],
  semesters: readonly T[]
): { semester: T; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.semester_id, (counts.get(row.semester_id) ?? 0) + 1);
  return semesters.flatMap((semester) => {
    const count = counts.get(semester.id);
    return count ? [{ semester, count }] : [];
  });
}

/** Sorts pending endorsements first (newest submitted first), then decided rows (newest decided first). */
export function sortFacultyEndorsements<
  T extends Pick<FacultyMeritEndorsementRecord, "id" | "status" | "submitted_at" | "decided_at">,
>(endorsements: readonly T[]): T[] {
  return [...endorsements].sort((a, b) => {
    const aPending = a.status === "pending";
    const bPending = b.status === "pending";
    if (aPending !== bPending) return aPending ? -1 : 1;

    const aTime = aPending ? a.submitted_at : (a.decided_at ?? a.submitted_at);
    const bTime = bPending ? b.submitted_at : (b.decided_at ?? b.submitted_at);
    if (aTime !== bTime) return aTime > bTime ? -1 : 1;

    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Pure eligibility check for waiving one demerit unit (FL-034).
 * Mirrors `public.waive_demerit` + `f_cmd_instructor(p_actor, d.bucket)` 1:1
 * (without checking cumulative bucket balance, which `waive_demerit` verifies atomically).
 */
export function canWaiveDemerit(
  demerit: {
    source: string;
    bucket: DisciplinaryBucket;
    student_id: string;
    issued_by: string;
    waived_at: string | null;
  },
  actor: {
    actorId: string;
    roles: readonly string[];
    councilRole: string | null;
  }
): boolean {
  if (demerit.waived_at !== null || demerit.student_id === actor.actorId) {
    return false;
  }

  if (demerit.source === "council") {
    return actor.councilRole === "executive";
  }

  if (demerit.issued_by !== actor.actorId) {
    return false;
  }

  const hasMatchingInstructorRole =
    (demerit.bucket === "office" && actor.roles.includes("Academic Instructor")) ||
    (demerit.bucket === "rle" && actor.roles.includes("Clinical Instructor"));

  if (!hasMatchingInstructorRole) {
    return false;
  }

  if (demerit.source === "faculty") {
    return true;
  }

  if (demerit.source === "external_ci") {
    return demerit.bucket === "rle" && actor.roles.includes("RLE Coordinator");
  }

  return false;
}
