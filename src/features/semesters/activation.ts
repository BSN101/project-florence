import type { TransactionSql } from "postgres";
import type { SemesterActionResult } from "./contracts";
import type { ActivateSemesterInput } from "./schemas";


/** Only use an application DB connection targeting the same hosted Supabase project. */
export function isMatchingSemesterDatabase(dbUrl: string, apiUrl: string | undefined): boolean {
  try {
    const db = new URL(dbUrl);
    const api = new URL(apiUrl ?? "");
    const ref = api.hostname.match(/^([a-z]{20})\.supabase\.co$/)?.[1];
    if (!ref || api.href !== `https://${ref}.supabase.co/`) return false;
    const direct = db.hostname === `db.${ref}.supabase.co` && db.username === "postgres";
    const pooler = /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(db.hostname) && db.username === `postgres.${ref}`;
    return ["postgres:", "postgresql:"].includes(db.protocol) && (direct || pooler) &&
      ["", "5432", "6543"].includes(db.port) && db.pathname === "/postgres" &&
      !!db.password && !db.search && !db.hash;
  } catch {
    return false;
  }
}

/** Caller owns the transaction; all checks and writes happen after acquiring the shared lock. */
export async function activateSemesterInTransaction(
  tx: TransactionSql,
  { semesterId, expectedCurrentSemesterId }: ActivateSemesterInput,
): Promise<SemesterActionResult> {
  await tx`select pg_advisory_xact_lock(hashtextextended('florence:semester-context', 0))`;
  const [current] = await tx<{ id: string }[]>`select id from public.semesters where is_current = true`;
  if ((current?.id ?? null) !== expectedCurrentSemesterId) {
    return { success: false, error: "The current semester changed. Refresh this page and review the switch again." };
  }

  const [target] = await tx<{ id: string; academic_year_start: number; term: string; is_current: boolean }[]>`
    select id, academic_year_start, term, is_current from public.semesters where id = ${semesterId}`;
  if (!target) return { success: false, error: "Target semester not found." };

  const label = `${target.term} (AY ${target.academic_year_start}–${target.academic_year_start + 1})`;
  if (target.is_current) return { success: true, message: `${label} is already active.` };

  await tx`update public.semesters set is_current = false where is_current = true`;
  await tx`update public.semesters set is_current = true where id = ${semesterId}`;
  return { success: true, message: `Activated ${label} as the current semester context.` };
}
