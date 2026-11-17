import type {
  BucketDisciplinaryBalance,
  DemeritRecord,
  DisciplinaryBucket,
  MeritApplicationRecord,
  MeritRecord,
  ServiceCreditRecord,
  StudentDisciplinarySummary,
} from "./contracts";

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
