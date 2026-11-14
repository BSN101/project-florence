// Rollback-only check of the T-017 roster CSV import SQL against the linked database.
// Applies pending import migrations plus smoke checks in ONE transaction, then rolls back.
// Nothing is committed. Run: node --env-file=.env.local scripts/check-roster-import.mjs
import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import pkg from "postgres";

const postgres = pkg.default ?? pkg;
const ROLLBACK = new Error("rollback");
// Edit this list to match `supabase migration list --remote` before running.
const PENDING = ["20261114020000_roster_import_email_case.sql"];
const body = (file) =>
  readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8")
    .replace(/^\s*begin;\s*$/m, "").replace(/^\s*commit;\s*$/m, "");

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1, onnotice: () => {} });
const results = [];
const check = (name, ok, note = "") => { results.push({ name, ok, note }); };

// Runs fn in a savepoint and returns the Postgres error code it raised, or null.
async function errCode(tx, fn) {
  try { await tx.savepoint(fn); return null; } catch (e) { return e.code ?? e.message; }
}

try {
  await sql.begin(async (tx) => {
    for (const file of PENDING) await tx.unsafe(body(file));
    check(`pending migrations apply (${PENDING.length})`, true);

    const [acl] = await tx`select
      has_function_privilege('authenticated', 'public.roster_import_csv(uuid,uuid,jsonb,boolean)', 'execute') as auth,
      has_function_privilege('service_role', 'public.roster_import_csv(uuid,uuid,jsonb,boolean)', 'execute') as service`;
    check("roster_import_csv is service_role only", acl.service && !acl.auth);

    const [exec] = await tx`select c.profile_id, p.university_id from public.council_memberships c
      join public.profiles p on p.id = c.profile_id
      where c.removed_at is null and c.access_role = 'executive' and p.account_status = 'active' limit 1`;
    assert(exec, "need an active Council Executive");
    const [rep] = await tx`select c.profile_id from public.council_memberships c
      where c.removed_at is null and c.access_role not in ('executive', 'operations') limit 1`;

    // Unused student numbers, so "create" rows never touch real students.
    const freshId = async () => {
      for (;;) {
        const id = `99-1-${String(randomInt(100000)).padStart(5, "0")}`;
        const [hit] = await tx`select 1 from public.profiles where university_id = ${id}`;
        if (!hit) return id;
      }
    };
    const row = (n, id, extra = {}) => ({
      row: n, university_id: id, last_name: "Importcheck", first_name: "Rollback",
      middle_name: null, suffix: null, email: null, year_level: 1, academic_status: "regular", ...extra,
    });
    const run = (rows, apply, key = randomUUID(), actor = exec.profile_id) =>
      tx`select public.roster_import_csv(${key}, ${actor}, ${tx.json(rows)}, ${apply}) as r`.then(([x]) => x.r);
    const exists = async (id) => (await tx`select 1 from public.profiles where university_id = ${id}`).length > 0;

    if (rep) {
      const code = await errCode(tx, (s) => s`select public.roster_import_csv(
        ${randomUUID()}, ${rep.profile_id}, ${s.json([row(2, "99-1-00000")])}, false)`);
      check("Representative cannot import", code === "42501", `got ${code}`);
    } else check("Representative cannot import", true, "skipped: no Representative on the roster");

    // A conflicting row blocks the whole file: the valid new student is not saved either.
    const [existing] = await tx`select university_id from public.profiles
      where university_id is not null and account_status = 'active' and id <> ${exec.profile_id} limit 1`;
    const goodId = await freshId();
    if (existing) {
      const code = await errCode(tx, (s) => s`select public.roster_import_csv(${randomUUID()}, ${exec.profile_id},
        ${s.json([row(2, goodId), row(3, existing.university_id, { last_name: "Notthisname" })])}, true)`);
      check("a conflict rejects the whole file", code === "22023" && !(await exists(goodId)), `got ${code}`);
    } else check("a conflict rejects the whole file", true, "skipped: no existing student");

    // Same request key twice: applied once, then replayed.
    const key = randomUUID();
    const first = await run([row(2, goodId)], true, key);
    const second = await run([row(2, goodId)], true, key);
    const [{ count }] = await tx`select count(*)::int as count from public.profiles where university_id = ${goodId}`;
    check("retrying with the same key replays without re-inserting",
      first.created === 1 && second.replayed === true && count === 1, `created ${first.created}, replayed ${second.replayed}, rows ${count}`);

    if (exec.university_id) {
      const preview = await run([row(2, exec.university_id)], false);
      check("an officer cannot import themselves", preview.rows[0].status === "invalid", preview.rows[0].message);
    } else check("an officer cannot import themselves", true, "skipped: Executive has no student number");

    const [archived] = await tx`select university_id from public.profiles
      where university_id is not null and account_status <> 'active' limit 1`;
    if (archived) {
      const preview = await run([row(2, archived.university_id)], false);
      check("an archived student is rejected", preview.rows[0].status === "invalid", preview.rows[0].message);
    } else check("an archived student is rejected", true, "skipped: no archived student");

    // Stored email keeps its typed case; the CSV email is lowercased. They must still match.
    const mixed = `Import.Check+${randomUUID().slice(0, 8)}@Example.com`;
    await tx`update public.profiles set email = ${mixed} where university_id = ${goodId}`;
    const dupe = await run([row(2, await freshId(), { email: mixed.toLowerCase() })], false);
    check("an email differing only in case is a conflict", dupe.rows[0].status === "conflict", dupe.rows[0].message);

    throw ROLLBACK;
  });
} catch (e) {
  if (e !== ROLLBACK) { console.error("FAILED:", e.message); process.exitCode = 1; }
} finally {
  await sql.end();
}

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.note ? `  (${r.note})` : ""}`);
if (results.some((r) => !r.ok)) process.exitCode = 1;
console.log("Rolled back; nothing was committed.");
