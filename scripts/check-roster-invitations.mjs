// Rollback-only check of the T-018 roster invitation SQL against the linked database.
// Applies pending invitation migrations plus smoke checks in ONE transaction, then rolls back.
// Nothing is committed. Run: node --env-file=.env.local scripts/check-roster-invitations.mjs
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import pkg from "postgres";

const postgres = pkg.default ?? pkg;
const ROLLBACK = new Error("rollback");
// Edit this list to match `supabase migration list --remote` before running.
const PENDING = ["20261114010000_invitation_deliveries.sql"];
const body = (file) =>
  readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8")
    .replace(/^\s*begin;\s*$/m, "").replace(/^\s*commit;\s*$/m, "");
const hash = () => randomBytes(32).toString("hex");
const expires = () => new Date(Date.now() + 7 * 864e5).toISOString();

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1, onnotice: () => {} });
const results = [];
const check = (name, ok, note = "") => { results.push({ name, ok, note }); };

// Runs fn in a savepoint and returns the Postgres error code it raised, or null.
async function errCode(tx, fn) {
  try { await tx.savepoint(fn); return null; } catch (e) { return e.code ?? e.message; }
}

try {
  await sql.begin(async (tx) => {
    // Only migrations not yet on the linked database; applied ones would collide with existing objects.
    for (const file of PENDING) await tx.unsafe(body(file));
    check(`pending migrations apply (${PENDING.length})`, true);

    const [acl] = await tx`select
      has_function_privilege('authenticated', 'public.florence_roster(uuid)', 'execute') as roster_auth,
      has_function_privilege('anon', 'public.florence_roster(uuid)', 'execute') as roster_anon,
      has_function_privilege('authenticated', 'public.roster_invite_student(uuid,uuid,uuid,text,timestamptz,boolean)', 'execute') as invite_auth,
      has_function_privilege('service_role', 'public.roster_invite_student(uuid,uuid,uuid,text,timestamptz,boolean)', 'execute') as invite_service,
      to_regprocedure('public.roster_invite_student(uuid,uuid,uuid,text,timestamptz)') is null as old_invite_gone`;
    check("florence_roster ACL restored (authenticated yes, anon no)", acl.roster_auth && !acl.roster_anon);
    check("roster_invite_student is service_role only", acl.invite_service && !acl.invite_auth);
    const [priv] = await tx`select
      has_table_privilege('authenticated', 'public.invitation_deliveries', 'select') as table_auth,
      has_function_privilege('authenticated', 'public.record_invitation_delivery(uuid,text)', 'execute') as record_auth,
      has_function_privilege('service_role', 'public.record_invitation_delivery(uuid,text)', 'execute') as record_service`;
    check("delivery table and command are not exposed to users", !priv.table_auth && !priv.record_auth && priv.record_service);
    check("old 5-arg roster_invite_student dropped", acl.old_invite_gone);

    const [exec] = await tx`select c.profile_id from public.council_memberships c
      join public.profiles p on p.id = c.profile_id
      where c.removed_at is null and c.access_role = 'executive' and p.account_status = 'active' limit 1`;
    assert(exec, "need an active Council Executive");
    const [rep] = await tx`select c.profile_id from public.council_memberships c
      where c.removed_at is null and c.access_role not in ('executive', 'operations') limit 1`;
    const [semester] = await tx`select public.f_cmd_current_semester() as id`;

    const invite = (actor, student, skip = false) => tx`select public.roster_invite_student(
      ${randomUUID()}, ${actor}, ${student}, ${hash()}, ${expires()}, ${skip}) as r`.then(([row]) => row.r);

    // Fixture student: eligible for an invitation, enrolled this semester, no pending invite.
    const [student] = await tx`select p.id from public.profiles p
      join public.enrollments n on n.student_id = p.id and n.semester_id = ${semester.id}
      where p.account_status = 'active' and p.auth_user_id is null and coalesce(btrim(p.email), '') <> ''
        and p.id <> ${exec.profile_id}
        and not exists (select 1 from public.invitations i where i.profile_id = p.id and i.status = 'pending')
      limit 1`;

    if (rep) {
      const code = await errCode(tx, (s) => s`select public.roster_invite_student(
        ${randomUUID()}, ${rep.profile_id}, ${student?.id ?? randomUUID()}, ${hash()}, ${expires()}, false)`);
      check("Representative cannot invite", code === "42501", `got ${code}`);
    } else check("Representative cannot invite", true, "skipped: no Representative on the roster");

    if (student) {
      const first = await invite(exec.profile_id, student.id);
      check("first invite creates a pending invitation", !first.skipped && Boolean(first.invitation_id));
      const second = await invite(exec.profile_id, student.id, true);
      const [{ status }] = await tx`select status from public.invitations where id = ${first.invitation_id}`;
      check("bulk (skip pending) leaves a live invitation alone", second.skipped === true && status === "pending");
      await tx`select public.record_invitation_delivery(${first.invitation_id}, 'failed')`;
      const [{ problem }] = await tx`select public.f_invitation_delivery_problem(id, created_at) as problem
        from public.invitations where id = ${first.invitation_id}`;
      check("a failed send is reported as a delivery problem", problem === "failed", `got ${problem}`);
      const dupe = await errCode(tx, (s) => s`select public.record_invitation_delivery(${first.invitation_id}, 'sent')`);
      const [{ status: kept }] = await tx`select status from public.invitation_deliveries where invitation_id = ${first.invitation_id}`;
      check("recording again keeps the first outcome", dupe === null && kept === "failed", `got ${dupe}/${kept}`);
      const edit = await errCode(tx, (s) => s`update public.invitation_deliveries set status = 'sent' where invitation_id = ${first.invitation_id}`);
      check("delivery rows are append-only", edit === "23514", `got ${edit}`);

      const third = await invite(exec.profile_id, student.id, true);
      const [{ status: closed }] = await tx`select status from public.invitations where id = ${first.invitation_id}`;
      check("bulk resends a live invitation whose email failed", !third.skipped && third.previous_closed === true && closed === "cancelled");

      const cancelled = await tx`select public.roster_cancel_invitation(${randomUUID()}, ${exec.profile_id}, ${third.invitation_id}) as r`;
      check("Executive can cancel a student invitation", cancelled[0].r.invitation_id === third.invitation_id);
    } else check("invite / skip / reissue / cancel", true, "skipped: no eligible student this semester");

    // Faculty invitation (created inside this transaction only) must stay outside Council scope.
    const [faculty] = await tx`select p.id, p.email from public.profiles p
      where p.university_id is null and p.email is not null
        and not exists (select 1 from public.invitations i where i.profile_id = p.id and i.status = 'pending')
      limit 1`;
    if (faculty) {
      const [fi] = await tx`insert into public.invitations (profile_id, email, purpose, status, token_hash, expires_at, created_by)
        values (${faculty.id}, ${faculty.email}, 'faculty_access', 'pending', ${hash()}, ${expires()}, ${exec.profile_id}) returning id`;
      const code = await errCode(tx, (s) => s`select public.roster_cancel_invitation(${randomUUID()}, ${exec.profile_id}, ${fi.id})`);
      check("Council cannot cancel a faculty invitation", code === "42501", `got ${code}`);
    } else check("Council cannot cancel a faculty invitation", true, "skipped: no faculty profile");

    const [archived] = await tx`select p.id from public.profiles p
      where p.university_id is not null and p.account_status <> 'active' limit 1`;
    if (archived) {
      const code = await errCode(tx, (s) => s`select public.roster_invite_student(
        ${randomUUID()}, ${exec.profile_id}, ${archived.id}, ${hash()}, ${expires()}, false)`);
      check("archived student cannot be invited", code === "55000", `got ${code}`);
    } else check("archived student cannot be invited", true, "skipped: no archived student");

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
