import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import postgres from "postgres";
import type { Database, Tables } from "../src/server/db/database.types";

const SEED = "florence-dev-accounts-v1";
// Stable fixture IDs are collision detectors, not permission or proof of ownership.
function fixtureId(name: string) {
  const hex = createHash("sha256").update(`${SEED}:${name}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export const fixtures = [
  { key: "admin", firstName: "Synthetic Admin", universityId: null, council: null, position: null, roles: ["Platform Admin"] },
  { key: "executive", firstName: "Synthetic Executive", universityId: "99-1-99001", council: "executive", position: "President" },
  { key: "operations", firstName: "Synthetic Operations", universityId: "99-1-99002", council: "operations", position: "Treasurer" },
  { key: "student", firstName: "Synthetic Student", universityId: "99-1-99003", council: null, position: null },
  { key: "representative", firstName: "Synthetic Representative", universityId: "99-1-99004", council: "representative", position: "Representative" },
  { key: "academic_instructor", firstName: "Synthetic Academic Instructor", universityId: null, council: null, position: null, roles: ["Academic Instructor"] },
  { key: "academic_coordinator", firstName: "Synthetic Academic Coordinator", universityId: null, council: null, position: null, roles: ["Academic Instructor", "Academic Coordinator"] },
  { key: "clinical_instructor", firstName: "Synthetic Clinical Instructor", universityId: null, council: null, position: null, roles: ["Clinical Instructor"] },
  { key: "rle_coordinator", firstName: "Synthetic RLE Coordinator", universityId: null, council: null, position: null, roles: ["Clinical Instructor", "RLE Coordinator"] },
].map((fixture) => ({
  ...fixture,
  id: fixtureId(fixture.key),
  email: `florence.dev.${fixture.key}@example.com`,
  assignmentId: fixtureId(`${fixture.key}:assignment`),
  enrollmentId: fixtureId(`${fixture.key}:enrollment`),
  roles: (fixture.roles ?? []).map((role) => ({
    role,
    // Retain the original administrator assignment ID.
    id: fixtureId(fixture.key === "admin" ? "admin:assignment" : `${fixture.key}:assignment:${role}`),
  })),
}));
type Fixture = (typeof fixtures)[number];
const ADMIN_ID = fixtures[0].id;
const SEMESTER_ID = fixtureId("semester");
const roleAssignments = fixtures.flatMap((fixture) => fixture.roles.map((role) => ({ ...role, profile_id: fixture.id })));
const studentCount = fixtures.filter((fixture) => fixture.universityId).length;
const councilCount = fixtures.filter((fixture) => fixture.council).length;

class SeedError extends Error {}
function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new SeedError(message);
}

export function readConfig(env: NodeJS.ProcessEnv) {
  const required = (name: string) => {
    const value = env[name];
    requireCondition(value && value.trim(), `Set ${name} in the ignored .env.local or process environment.`);
    return value;
  };
  requireCondition(env.ENABLE_DEV_ACCOUNT_SEED === "true", "Development seeding requires ENABLE_DEV_ACCOUNT_SEED=true.");
  requireCondition(env.NODE_ENV !== "production", "Development seeding is forbidden with NODE_ENV=production.");
  const ref = required("SEED_EXPECTED_PROJECT_REF");
  requireCondition(/^[a-z]{20}$/.test(ref), "SEED_EXPECTED_PROJECT_REF must be a hosted Supabase project reference.");
  function url(name: string) {
    try { return new URL(required(name)); }
    catch { throw new SeedError(`Set a valid ${name}; its value is intentionally not logged.`); }
  }
  const api = url("NEXT_PUBLIC_SUPABASE_URL");
  requireCondition(api.href === `https://${ref}.supabase.co/`, "NEXT_PUBLIC_SUPABASE_URL must exactly match the expected project's HTTPS URL (no custom domains, credentials or query parameters).");
  const db = url("SEED_DATABASE_URL");
  const direct = db.hostname === `db.${ref}.supabase.co` && db.username === "postgres";
  const pooler = /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(db.hostname) && db.username === `postgres.${ref}`;
  requireCondition(
    ["postgres:", "postgresql:"].includes(db.protocol) && (direct || pooler) &&
    ["", "5432", "6543"].includes(db.port) && db.pathname === "/postgres" &&
    db.password && !db.search && !db.hash,
    "SEED_DATABASE_URL must target the expected project's direct or Supavisor postgres database, include credentials, and have no query/fragment. TLS verification is enforced by the script.",
  );
  try { decodeURIComponent(db.password); }
  catch { throw new SeedError("SEED_DATABASE_URL contains invalid credential encoding."); }
  const key = required("SUPABASE_SECRET_KEY");
  const passwords = new Map(fixtures.map((fixture) => {
    const name = `SEED_${fixture.key.toUpperCase()}_PASSWORD`;
    const password = required(name);
    requireCondition(Buffer.byteLength(password) >= 12 && Buffer.byteLength(password) <= 72, `${name} must contain 12–72 UTF-8 bytes.`);
    return [fixture.key, password];
  }));
  requireCondition(new Set(passwords.values()).size === fixtures.length, "Use a different password for each synthetic account.");
  const yearText = required("SEED_SEMESTER_YEAR");
  const year = Number(yearText);
  requireCondition(/^\d{4}$/.test(yearText) && year >= 1900 && year <= 9998, "SEED_SEMESTER_YEAR must be between 1900 and 9998.");
  const term = required("SEED_SEMESTER_TERM");
  requireCondition(term === term.trim() && term.length <= 100 && !/[\r\n\x00]/.test(term), "SEED_SEMESTER_TERM must be trimmed nonblank text of at most 100 characters; use the team's agreed term.");
  function date(name: string) {
    const value = required(name);
    const parsed = new Date(`${value}T00:00:00Z`);
    requireCondition(/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value, `${name} must be a valid YYYY-MM-DD date.`);
    return value;
  }
  const startsOn = date("SEED_SEMESTER_STARTS_ON");
  const endsOn = date("SEED_SEMESTER_ENDS_ON");
  requireCondition(endsOn >= startsOn, "Semester end must not precede its start.");
  const current = required("SEED_SEMESTER_IS_CURRENT");
  requireCondition(current === "true" || current === "false", "SEED_SEMESTER_IS_CURRENT must explicitly be true or false.");
  return { ref, apiUrl: api.origin, db, key, passwords, year, term, startsOn, endsOn, isCurrent: current === "true" };
}
type Config = ReturnType<typeof readConfig>;

export function verifyAuthUser(user: User, fixture: Fixture) {
  const marker = user.app_metadata;
  requireCondition(
    user.email === fixture.email && marker.florence_dev_seed === SEED &&
    marker.fixture === fixture.key && marker.profile_id === fixture.id &&
    !!user.email_confirmed_at && !user.is_anonymous &&
    (!user.banned_until || Date.parse(user.banned_until) <= Date.now()) &&
    !user.new_email && (!user.identities || user.identities.every((identity) => identity.provider === "email")),
    `Auth identity conflict for ${fixture.key}. Inspect its seed marker, email, confirmation, ban and identity state; do not adopt or reactivate it.`,
  );
}

async function inspectAuth(client: SupabaseClient<Database>) {
  const users = new Map<string, User>();
  // Admin listUsers is paginated. Never log the returned unrelated account data.
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new SeedError("Auth inventory failed. Check the privileged API key, connectivity and Auth Admin access.");
    for (const user of data.users) {
      const candidates = fixtures.filter((fixture) =>
        user.email?.toLowerCase() === fixture.email ||
        (user.app_metadata.florence_dev_seed === SEED &&
          (user.app_metadata.fixture === fixture.key || user.app_metadata.profile_id === fixture.id)),
      );
      for (const fixture of candidates) {
        verifyAuthUser(user, fixture);
        requireCondition(!users.has(fixture.key), `Multiple Auth identities match ${fixture.key}; inspect before retrying.`);
        users.set(fixture.key, user);
      }
    }
    if (data.users.length < 100) break;
  }
  return users;
}

export function assertMatches(actual: Record<string, unknown>, expected: Record<string, unknown>, label: string) {
  for (const [key, value] of Object.entries(expected)) {
    requireCondition(actual[key] === value, `${label} conflicts at ${key}. Inspect the existing fixture; no record will be adopted, relinked or overwritten.`);
  }
}

export async function inspectDatabase(sql: postgres.TransactionSql, config: Config, users: Map<string, User>) {
  // Same order in preflight and commit. Semester writers use this shared key.
  await sql`select pg_advisory_xact_lock(hashtextextended('florence:dev-account-seed:v1', 0))`;
  await sql`select pg_advisory_xact_lock(hashtextextended('florence:semester-context', 0))`;
  const semesters = await sql<Tables<"semesters">[]>`
    select id, academic_year_start, term, starts_on::text, ends_on::text, is_current, created_by, created_at::text
    from public.semesters where id = ${SEMESTER_ID} or is_current
      or (academic_year_start = ${config.year} and term = ${config.term}) for update`;
  const semester = semesters.find((row) => row.id === SEMESTER_ID);
  requireCondition(!semesters.some((row) => row.id !== SEMESTER_ID && row.academic_year_start === config.year && row.term === config.term), "Another semester already uses the configured year/term. Choose a distinct synthetic context; it will not be adopted.");
  requireCondition(!config.isCurrent || !semesters.some((row) => row.is_current && row.id !== SEMESTER_ID), "Another semester is current. Use SEED_SEMESTER_IS_CURRENT=false for an inactive fixture, or obtain a separately approved context change; the seed never replaces it.");
  if (semester) assertMatches(semester, {
    academic_year_start: config.year, term: config.term, starts_on: config.startsOn,
    ends_on: config.endsOn, is_current: config.isCurrent, created_by: ADMIN_ID,
  }, "Seed semester");

  const ids = fixtures.map((fixture) => fixture.id);
  const profiles = await sql<Tables<"profiles">[]>`
    select id, auth_user_id, university_id, email, first_name, middle_name, last_name, suffix,
      account_status, created_at::text, updated_at::text
    from public.profiles where id in ${sql(ids)}
      or lower(email) in ${sql(fixtures.map((fixture) => fixture.email))}
      or university_id in ${sql(fixtures.flatMap((fixture) => fixture.universityId ? [fixture.universityId] : []))}
      or auth_user_id = any(${[...users.values()].map((user) => user.id)}::uuid[])
    order by id for update`;
  for (const profile of profiles) {
    const fixture = fixtures.find((entry) => entry.id === profile.id);
    requireCondition(fixture, "A seed email, university number or Auth UUID belongs to another profile. Resolve the collision outside this seed.");
    const user = users.get(fixture.key);
    requireCondition(user, `Profile ${fixture.key} exists without its verified seed Auth identity. Refusing to recreate or relink it.`);
    assertMatches(profile, {
      auth_user_id: user.id, university_id: fixture.universityId, email: fixture.email,
      first_name: fixture.firstName, last_name: "Fixture", middle_name: null, suffix: null, account_status: "active",
    }, `${fixture.key} profile`);
  }
  const roles = await sql<Tables<"role_assignments">[]>`
    select id, profile_id, role, assigned_by, assigned_at::text, removed_by, removed_at::text
    from public.role_assignments where profile_id in ${sql(ids)} or id in ${sql(roleAssignments.map((role) => role.id))}`;
  const memberships = await sql<Tables<"council_memberships">[]>`
    select id, profile_id, access_role, position_label, assigned_by, assigned_at::text, removed_by, removed_at::text
    from public.council_memberships where profile_id in ${sql(ids)} or id in ${sql(fixtures.map((f) => f.assignmentId))}`;
  const enrollments = await sql<Tables<"enrollments">[]>`
    select id, student_id, semester_id, year_level, academic_status, created_at::text, updated_at::text
    from public.enrollments where student_id in ${sql(ids)} or id in ${sql(fixtures.map((f) => f.enrollmentId))}`;
  for (const role of roles) {
    const expected = roleAssignments.find((assignment) => assignment.id === role.id);
    requireCondition(expected, "Unexpected seed role history. Removed or extra assignments are not repaired.");
    assertMatches(role, {
      ...expected, assigned_by: ADMIN_ID, removed_by: null, removed_at: null,
    }, "Seed role assignment");
  }
  for (const membership of memberships) {
    const fixture = fixtures.find((f) => f.id === membership.profile_id && f.council);
    requireCondition(fixture, "Unexpected Council membership on a seed identity.");
    assertMatches(membership, {
      id: fixture.assignmentId, access_role: fixture.council, position_label: fixture.position,
      assigned_by: ADMIN_ID, removed_by: null, removed_at: null,
    }, `${fixture.key} membership`);
  }
  for (const enrollment of enrollments) {
    const fixture = fixtures.find((f) => f.id === enrollment.student_id && f.universityId);
    requireCondition(fixture, "Unexpected enrollment on a seed identity.");
    assertMatches(enrollment, {
      id: fixture.enrollmentId, semester_id: SEMESTER_ID, year_level: 1, academic_status: "regular",
    }, `${fixture.key} enrollment`);
  }
  // Florence writes commit together: only an entirely absent or complete fixture
  // set can be a result of this seed. Partial Auth-only runs are recoverable;
  // partial Florence state is external drift, not permission to restore roles.
  const hasFixtureRows = semester || profiles.length || roles.length || memberships.length || enrollments.length;
  requireCondition(!hasFixtureRows || (semester && profiles.length === fixtures.length && roles.length === roleAssignments.length && memberships.length === councilCount && enrollments.length === studentCount),
    "Partial Florence fixture state found. All seed database rows commit together; investigate external changes rather than restoring missing profiles, roles or enrollments.");
  return { semester, profiles, roles, memberships, enrollments };
}

export async function seedDatabase(sql: postgres.TransactionSql, config: Config, users: Map<string, User>) {
  const state = await inspectDatabase(sql, config, users);
  let inserted = 0;
  for (const fixture of fixtures) {
    const user = users.get(fixture.key);
    requireCondition(user, `Verified Auth identity missing for ${fixture.key}.`);
    if (!state.profiles.some((profile) => profile.id === fixture.id)) {
      await sql`insert into public.profiles
        (id, auth_user_id, university_id, email, first_name, last_name, account_status, created_at, updated_at)
        values (${fixture.id}, ${user.id}, ${fixture.universityId}, ${fixture.email}, ${fixture.firstName}, 'Fixture', 'active', now(), now())`;
      inserted++;
    }
    // Admin is first; each coordinator's underlying instructor is first in roles.
    // Self-attribution is limited to the controlled initial admin bootstrap.
    for (const assignment of fixture.roles) {
      if (state.roles.some((row) => row.id === assignment.id)) continue;
      await sql`insert into public.role_assignments (id, profile_id, role, assigned_by, assigned_at)
        values (${assignment.id}, ${fixture.id}, ${assignment.role}, ${ADMIN_ID}, now())`;
      inserted++;
    }
  }
  if (!state.semester) {
    await sql`insert into public.semesters
      (id, academic_year_start, term, starts_on, ends_on, is_current, created_by, created_at)
      values (${SEMESTER_ID}, ${config.year}, ${config.term}, ${config.startsOn}, ${config.endsOn}, ${config.isCurrent}, ${ADMIN_ID}, now())`;
    inserted++;
  }
  for (const fixture of fixtures.filter((fixture) => fixture.universityId)) {
    if (!state.enrollments.some((row) => row.id === fixture.enrollmentId)) {
      await sql`insert into public.enrollments
        (id, student_id, semester_id, year_level, academic_status, created_at, updated_at)
        values (${fixture.enrollmentId}, ${fixture.id}, ${SEMESTER_ID}, 1, 'regular', now(), now())`;
      inserted++;
    }
    if (fixture.council && !state.memberships.some((row) => row.id === fixture.assignmentId)) {
      await sql`insert into public.council_memberships
        (id, profile_id, access_role, position_label, assigned_by, assigned_at)
        values (${fixture.assignmentId}, ${fixture.id}, ${fixture.council}, ${fixture.position}, ${ADMIN_ID}, now())`;
      inserted++;
    }
  }
  await sql`set constraints all immediate`;
  const verified = await inspectDatabase(sql, config, users);
  requireCondition(verified.semester && verified.profiles.length === fixtures.length && verified.roles.length === roleAssignments.length && verified.memberships.length === councilCount && verified.enrollments.length === studentCount, "Seed verification failed; rolling back all Florence writes.");
  return inserted;
}

async function main() {
  let stage = "configuration";
  let sql: ReturnType<typeof postgres> | undefined;
  let authCreated = 0;
  let committed = false;
  try {
    const config = readConfig(process.env);
    requireCondition(process.argv.slice(2).every((arg) => arg === "--check-config"), "Only --check-config is supported.");
    if (process.argv.includes("--check-config")) {
      console.log("Seed configuration is valid. No network requests or writes performed.");
      return;
    }
    const client = createClient<Database>(config.apiUrl, config.key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (input, init) => fetch(input, { ...init, redirect: "error", signal: AbortSignal.timeout(30_000) }) },
    });
    const caCertPath = process.env.NODE_EXTRA_CA_CERTS;
    let ca: string | undefined;
    if (caCertPath) {
      requireCondition(existsSync(caCertPath), `NODE_EXTRA_CA_CERTS file does not exist: ${caCertPath}`);
      ca = readFileSync(caCertPath, "utf8");
    }
    sql = postgres({
      host: config.db.hostname, port: Number(config.db.port || 5432), database: "postgres",
      username: decodeURIComponent(config.db.username), password: decodeURIComponent(config.db.password),
      ssl: ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: false },
      max: 1, prepare: false, connect_timeout: 15,
      connection: { application_name: SEED, statement_timeout: 30_000, lock_timeout: 10_000 },
      onnotice: () => {},
    });
    stage = "Auth inventory";
    let users = await inspectAuth(client);
    stage = "database preflight (before Auth creation)";
    await sql.begin("isolation level read committed", (tx) => inspectDatabase(tx, config, users));
    for (const fixture of fixtures) {
      stage = `Auth creation: ${fixture.key}`;
      if (users.has(fixture.key)) continue;
      const { data, error } = await client.auth.admin.createUser({
        email: fixture.email, password: config.passwords.get(fixture.key), email_confirm: true,
        app_metadata: { florence_dev_seed: SEED, fixture: fixture.key, profile_id: fixture.id },
      });
      if (error || !data.user) throw new SeedError(`Could not create ${fixture.key}. Check Auth policy/connectivity and rerun; an uncertain response may still have created the marked account. No password reset or automatic deletion will be attempted.`);
      verifyAuthUser(data.user, fixture);
      users.set(fixture.key, data.user);
      authCreated++;
      console.log(`Created synthetic Auth account: ${fixture.key}`);
    }
    stage = "Auth revalidation";
    users = await inspectAuth(client);
    stage = "Florence transaction (including commit)";
    const inserted = await sql.begin("isolation level read committed", (tx) => seedDatabase(tx, config, users));
    committed = true;
    console.log(`Seed complete: ${authCreated} Auth users created; ${inserted} Florence rows inserted. Existing rows/passwords were not updated.`);
    if (!config.isCurrent) console.log("The synthetic semester is inactive. Current-context workflows may remain unavailable for these enrollments.");
    for (const fixture of fixtures) console.log(`${fixture.key}: ${fixture.email}`);
  } catch (error) {
    // Provider/driver errors may contain credentials, SQL parameters or private rows.
    const errCode = (error as { code?: string })?.code ? ` [${(error as { code?: string }).code}]` : "";
    const rawMsg = (error as Error)?.message ?? "";
    const sanitizedMsg = rawMsg.replace(/:[^:@\s]+@/g, ":***@");
    const detail = error instanceof SeedError
      ? error.message
      : `Provider/database operation failed${errCode}: ${sanitizedMsg}. Check connectivity, TLS trust, privileges and deployed constraints.`;
    console.error(`Seed stopped at ${stage}: ${detail}`);
    console.error(`Auth users reported created this run: ${authCreated}. Florence commit confirmed: ${committed}. Auth and database operations are not atomic together; rerun unchanged configuration to inspect/resume. A lost commit response requires inspection, not cleanup.`);
    process.exitCode = 1;
  } finally {
    if (sql) {
      try { await sql.end({ timeout: 5 }); }
      catch {
        console.error("Database connection cleanup failed; raw error suppressed. Inspect the reported commit status before rerunning.");
        process.exitCode = 1;
      }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
