import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertMatches, fixtures, inspectDatabase, readConfig, seedDatabase, verifyAuthUser } from "./seed-dev-accounts.ts";

// These values are test inputs only; no test opens a network connection.
const ref = "abcdefghijklmnopqrst";
function environment() {
  return {
    ENABLE_DEV_ACCOUNT_SEED: "true",
    SEED_EXPECTED_PROJECT_REF: ref,
    NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
    SUPABASE_SECRET_KEY: "not-a-credential",
    SEED_DATABASE_URL: `postgresql://postgres:not-a-credential@db.${ref}.supabase.co:5432/postgres`,
    ...Object.fromEntries(fixtures.map((f) => [`SEED_${f.key.toUpperCase()}_PASSWORD`, `test-input-only-${f.key}`])),
    SEED_SEMESTER_YEAR: "2026",
    SEED_SEMESTER_TERM: "1st Semester",
    SEED_SEMESTER_STARTS_ON: "2026-08-01",
    SEED_SEMESTER_ENDS_ON: "2026-12-31",
    SEED_SEMESTER_IS_CURRENT: "false",
  };
}

test("accepts all approved seed semester terms", () => {
  for (const term of ["1st Semester", "2nd Semester", "Midyear"]) {
    assert.equal(readConfig({ ...environment(), SEED_SEMESTER_TERM: term }).term, term);
  }
});

test("accepts a matching direct or Supavisor target", () => {
  assert.equal(readConfig(environment()).isCurrent, false);
  const env = environment();
  env.SEED_DATABASE_URL = `postgresql://postgres.${ref}:not-a-credential@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;
  assert.equal(readConfig(env).ref, ref);
});

for (const [name, value] of [
  ["ENABLE_DEV_ACCOUNT_SEED", "false"],
  ["NODE_ENV", "production"],
  ["SEED_EXPECTED_PROJECT_REF", "wrong"],
  ["NEXT_PUBLIC_SUPABASE_URL", "https://differentprojecthere.supabase.co"],
  ["NEXT_PUBLIC_SUPABASE_URL", `https://${ref}.supabase.co.evil.example`],
  ["NEXT_PUBLIC_SUPABASE_URL", `https://${ref}.supabase.co/?host=other`],
  ["SEED_DATABASE_URL", "postgres://postgres:secret@localhost/postgres"],
  ["SEED_DATABASE_URL", `postgres://postgres.wrong:secret@aws-0-ap-southeast-1.pooler.supabase.com/postgres`],
  ["SEED_DATABASE_URL", `postgres://postgres:secret@db.${ref}.supabase.co/postgres?sslmode=disable`],
  ["SEED_DATABASE_URL", `postgres://postgres:bad%ZZ@db.${ref}.supabase.co/postgres`],
  ["SEED_ADMIN_PASSWORD", ""],
  ["SEED_ADMIN_PASSWORD", "short"],
  ["SEED_SEMESTER_YEAR", "9999"],
  ["SEED_SEMESTER_TERM", " "],
  ["SEED_SEMESTER_TERM", "Summer"],
  ["SEED_SEMESTER_STARTS_ON", "2026-02-30"],
  ["SEED_SEMESTER_ENDS_ON", "2026-01-01"],
  ["SEED_SEMESTER_IS_CURRENT", "yes"],
]) {
  test(`rejects unsafe configuration: ${name} (${value || "empty"})`, () => {
    assert.throws(() => readConfig({ ...environment(), [name]: value }));
  });
}

test("requires distinct account passwords", () => {
  const env = environment();
  env.SEED_ADMIN_PASSWORD = env.SEED_STUDENT_PASSWORD;
  assert.throws(() => readConfig(env), /different password/);
});

function authUser() {
  const fixture = fixtures[0];
  return {
    email: fixture.email,
    email_confirmed_at: "2026-01-01T00:00:00Z",
    app_metadata: { florence_dev_seed: "florence-dev-accounts-v1", fixture: fixture.key, profile_id: fixture.id },
    identities: [{ provider: "email" }],
  };
}

test("reuses only an explicitly marked, confirmed seed identity", () => {
  verifyAuthUser(authUser(), fixtures[0]);
  for (const mutation of [
    { app_metadata: {} }, { email: "unrelated@example.com" }, { email_confirmed_at: null },
    { banned_until: "9999-01-01T00:00:00Z" }, { new_email: "other@example.com" },
    { identities: [{ provider: "github" }] }, { is_anonymous: true },
  ]) assert.throws(() => verifyAuthUser({ ...authUser(), ...mutation }, fixtures[0]), /Auth identity conflict/);
});

test("CLI check-config exits without accessing the fake network target", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./seed-dev-accounts.ts", import.meta.url)), "--check-config"], {
    env: { ...process.env, ...environment(), NODE_ENV: "development" }, encoding: "utf8", timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No network requests or writes performed/);
});

// A tiny tagged-query stub exercises preflight decisions, not PostgreSQL execution.
function databaseStub(mode = "complete") {
  const config = readConfig(environment());
  const users = new Map(fixtures.map((fixture) => [fixture.key, { id: fixture.id }]));
  let semesterId;
  const writes = [];
  function sql(parts, ...values) {
    if (!parts.raw) return parts;
    const query = parts.join("?");
    if (query.includes("insert into")) { writes.push({ query, values }); return []; }
    if (query.includes("set constraints all immediate") && mode === "empty") mode = "complete";
    if (query.includes("from public.semesters")) {
      semesterId = values[0];
      if (mode === "empty") return [];
      if (mode === "other-current") return [{ id: "unrelated", academic_year_start: 2025, term: "Other", is_current: true }];
      return [{ id: semesterId, academic_year_start: config.year, term: config.term,
        starts_on: config.startsOn, ends_on: config.endsOn, is_current: false, created_by: fixtures[0].id }];
    }
    if (mode === "empty" || mode === "other-current") return [];
    if (query.includes("from public.profiles")) return fixtures.map((f) => ({
      id: f.id, auth_user_id: f.id, university_id: f.universityId, email: f.email,
      first_name: f.firstName, last_name: "Fixture", middle_name: null, suffix: null, account_status: "active",
    }));
    if (query.includes("from public.role_assignments")) {
      const roles = fixtures.flatMap((f) => f.roles.map((role) => ({
        ...role, profile_id: f.id, assigned_by: fixtures[0].id, removed_by: null, removed_at: null,
      })));
      if (mode === "missing-role") return roles.filter((role) => role.role !== "Platform Admin");
      if (mode === "missing-instructor") return roles.filter((role) => role.profile_id !== fixtures.find((f) => f.key === "academic_coordinator").id || role.role !== "Academic Instructor");
      if (mode === "wrong-coordinator") roles.find((role) => role.role === "Academic Coordinator").role = "RLE Coordinator";
      if (mode === "removed-role") roles[1].removed_at = "2026-01-01";
      if (mode === "wrong-actor") roles[1].assigned_by = roles[1].profile_id;
      return roles;
    }
    if (query.includes("from public.council_memberships")) return fixtures.filter((f) => f.council).map((f) => ({
      id: f.assignmentId, profile_id: f.id, access_role: f.council, position_label: f.position,
      assigned_by: fixtures[0].id, removed_by: null, removed_at: null,
    }));
    if (query.includes("from public.enrollments")) return fixtures.filter((f) => f.universityId).map((f) => ({
      id: f.enrollmentId, student_id: f.id, semester_id: semesterId, year_level: 1, academic_status: "regular",
    }));
    return [];
  }
  return { sql, config, users, writes };
}

test("preflight accepts empty/Auth-only state and a complete unchanged fixture", async () => {
  for (const mode of ["empty", "complete"]) {
    const { sql, config, users } = databaseStub(mode);
    await inspectDatabase(sql, config, users);
  }
});

test("preflight refuses to restore a missing administrator assignment", async () => {
  const { sql, config, users } = databaseStub("missing-role");
  await assert.rejects(inspectDatabase(sql, config, users), /Partial Florence fixture state/);
});

test("preflight never replaces another current semester", async () => {
  const { sql, config, users } = databaseStub("other-current");
  await inspectDatabase(sql, config, users);
  await assert.rejects(inspectDatabase(sql, { ...config, isCurrent: true }, users), /Another semester is current/);
});

test("nine fixtures cover exactly the agreed combinations", () => {
  assert.equal(fixtures.length, 9);
  assert.equal(fixtures[0].key, "admin");
  assert.deepEqual(Object.fromEntries(fixtures.map((f) => [f.key, f.roles.map((r) => r.role)])), {
    admin: ["Platform Admin"], executive: [], operations: [], student: [], representative: [],
    academic_instructor: ["Academic Instructor"],
    academic_coordinator: ["Academic Instructor", "Academic Coordinator"],
    clinical_instructor: ["Clinical Instructor"],
    rle_coordinator: ["Clinical Instructor", "RLE Coordinator"],
  });
  const students = fixtures.filter((f) => f.universityId);
  assert.equal(students.length, 4);
  assert.equal(new Set(students.map((f) => f.universityId)).size, 4);
  for (const f of students) assert.match(f.universityId, /^\d{2}-1-\d{5}$/);
  assert.deepEqual(fixtures.filter((f) => f.council).map((f) => f.council), ["executive", "operations", "representative"]);
  for (const f of fixtures.filter((f) => f.roles.length)) {
    assert.equal(f.universityId, null);
    assert.equal(f.council, null);
  }
  assert.equal(new Set(fixtures.map((f) => f.email)).size, 9);
  assert.equal(new Set(fixtures.flatMap((f) => [f.id, ...f.roles.map((r) => r.id)])).size, 16);
});

for (const mode of ["missing-instructor", "wrong-coordinator", "removed-role", "wrong-actor"]) {
  test(`preflight rejects ${mode} without writes`, async () => {
    const { sql, config, users, writes } = databaseStub(mode);
    await assert.rejects(seedDatabase(sql, config, users));
    assert.equal(writes.length, 0);
  });
}

test("database writes bootstrap admin and order instructor before coordinator; rerun writes nothing", async () => {
  const { sql, config, users, writes } = databaseStub("empty");
  assert.equal(await seedDatabase(sql, config, users), 24);
  assert.match(writes[0].query, /insert into public.profiles/);
  assert.equal(writes[0].values[0], fixtures[0].id);
  const assignments = writes.filter((w) => w.query.includes("insert into public.role_assignments"));
  assert.equal(assignments.length, 7);
  assert.equal(assignments[0].values[2], "Platform Admin");
  for (const w of assignments) assert.equal(w.values[3], fixtures[0].id);
  for (const key of ["academic_coordinator", "rle_coordinator"]) {
    const fixture = fixtures.find((f) => f.key === key);
    assert.deepEqual(assignments.filter((w) => w.values[1] === fixture.id).map((w) => w.values[2]), fixture.roles.map((r) => r.role));
  }
  const enrollments = writes.filter((w) => w.query.includes("insert into public.enrollments"));
  assert.equal(enrollments.length, 4);
  for (const w of enrollments) assert.ok(fixtures.find((f) => f.id === w.values[1]).universityId);
  const memberships = writes.filter((w) => w.query.includes("insert into public.council_memberships"));
  assert.equal(memberships.length, 3);
  for (const w of memberships) assert.equal(w.values[4], fixtures[0].id);
  assert.equal(await seedDatabase(sql, config, users), 0);
  assert.equal(writes.length, 24);
});

test("each fixture requires its own configured password", () => {
  for (const fixture of fixtures) {
    const env = environment();
    delete env[`SEED_${fixture.key.toUpperCase()}_PASSWORD`];
    assert.throws(() => readConfig(env), /Set SEED_.*_PASSWORD/);
  }
});

test("fixture comparison rejects archive, relink and assignment changes", () => {
  const expected = { account_status: "active", auth_user_id: "original", removed_at: null, role: "Platform Admin" };
  assertMatches({ ...expected, created_at: "retained" }, expected, "fixture");
  for (const change of [
    { account_status: "archived" }, { auth_user_id: "replacement" },
    { removed_at: "2026-01-01" }, { role: "Academic Instructor" },
  ]) assert.throws(() => assertMatches({ ...expected, ...change }, expected, "fixture"), /conflicts/);
});
