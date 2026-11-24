// Rollback-only check of the T-038 record_refund SQL against the linked database.
// Applies pending refund migrations plus smoke checks in ONE transaction, then rolls back.
// Nothing is committed. Run: node --env-file=.env.local scripts/check-record-refund.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import pkg from "postgres";

const postgres = pkg.default ?? pkg;
const ROLLBACK = new Error("rollback");
// Edit this list to match `supabase migration list --remote` before running.
const PENDING = [];
const body = (file) =>
  readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8")
    .replace(/^\s*begin;\s*$/m, "").replace(/^\s*commit;\s*$/m, "");

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1, onnotice: () => {} });
const results = [];
let dbNow;
const check = (name, ok, note = "") => { results.push({ name, ok, note }); };

// Runs fn in a savepoint and returns the Postgres error code and message it raised, or null.
async function err(tx, fn) {
  try { await tx.savepoint(fn); return null; } catch (e) { return { code: e.code, message: e.message }; }
}
// The machine clock can run ahead of the database's, so default to the transaction's start time.
const refund = (tx, key, actor, receipt, at = dbNow) =>
  tx`select public.record_refund(${key}, ${actor}, ${receipt}, ${at}::timestamptz, ${"rollback check"}, true) as r`;

try {
  await sql.begin(async (tx) => {
    [{ now: dbNow }] = await tx`select now()`;
    for (const file of PENDING) await tx.unsafe(body(file));
    check(`pending migrations apply (${PENDING.length})`, true);

    const sig = "public.record_refund(uuid,uuid,uuid,timestamptz,text,boolean)";
    const [acl] = await tx`select has_function_privilege('authenticated', ${sig}, 'execute') as auth,
      has_function_privilege('anon', ${sig}, 'execute') as anon,
      has_function_privilege('service_role', ${sig}, 'execute') as service`;
    check("record_refund is service_role only", acl.service && !acl.auth && !acl.anon);

    const [exec] = await tx`select c.profile_id from public.council_memberships c
      join public.profiles p on p.id = c.profile_id
      where c.removed_at is null and c.access_role = 'executive' and p.account_status = 'active' limit 1`;
    assert(exec, "need an active Council Executive");
    const [pay] = await tx`select p.id, p.receipt_id, p.student_id, p.status, r.received_at from public.payments p
      join public.payment_receipts r on r.id = p.receipt_id
      where p.is_receipt_record and p.record_status = 'current' and p.status = 'verified'
        and p.student_id <> ${exec.profile_id}
        and not exists (select 1 from public.payment_refunds f where f.receipt_id = p.receipt_id)
      limit 1`;
    assert(pay, "need a verified, unrefunded receipt of another student");

    const missing = await err(tx, (s) => refund(s, randomUUID(), exec.profile_id, randomUUID()));
    check("missing receipt says not found", missing?.message === "Payment receipt not found", missing?.message);

    const early = new Date(Date.parse(pay.received_at) - 60_000).toISOString();
    const chron = await err(tx, (s) => refund(s, randomUUID(), exec.profile_id, pay.receipt_id, early));
    check("refund before receipt is refused", chron?.message === "Invalid receipt/refund chronology", chron?.message);

    const [rep] = await tx`select c.profile_id from public.council_memberships c
      join public.profiles p on p.id = c.profile_id
      where c.removed_at is null and c.access_role = 'representative' and p.account_status = 'active'
        and not exists (select 1 from public.council_memberships o where o.profile_id = c.profile_id
          and o.removed_at is null and o.access_role <> 'representative') limit 1`;
    if (rep) {
      const e = await err(tx, (s) => refund(s, randomUUID(), rep.profile_id, pay.receipt_id));
      check("Representative is refused", e?.code === "42501", e?.message);
    } else check("Representative is refused", true, "skipped: no active Representative");

    const [arch] = await tx`select c.profile_id from public.council_memberships c
      join public.profiles p on p.id = c.profile_id
      where c.removed_at is null and c.access_role = 'executive' and p.account_status <> 'active' limit 1`;
    if (arch) {
      const e = await err(tx, (s) => refund(s, randomUUID(), arch.profile_id, pay.receipt_id));
      check("non-active officer is refused", Boolean(e), e?.message);
    } else check("non-active officer is refused", true, "skipped: no non-active Executive");

    const [selfPay] = await tx`select p.receipt_id, p.student_id from public.payments p
      join public.council_memberships c on c.profile_id = p.student_id and c.removed_at is null and c.access_role = 'executive'
      join public.profiles pr on pr.id = p.student_id and pr.account_status = 'active'
      where p.is_receipt_record and p.record_status = 'current' and p.status = 'verified' limit 1`;
    if (selfPay) {
      const e = await err(tx, (s) => refund(s, randomUUID(), selfPay.student_id, selfPay.receipt_id));
      check("self refund is refused", e?.message === "Self refund recording forbidden", e?.message);
    } else check("self refund is refused", true, "skipped: no Executive with their own verified receipt");

    const obligationsBefore = await tx`select o.id, o.waived_at, o.amount from public.obligations o
      join public.payment_items i on i.obligation_id = o.id where i.payment_id = ${pay.id} order by o.id`;
    const notices = () => tx`select count(*)::int as n from public.notifications
      where recipient_id = ${pay.student_id} and kind = 'payment_refunded'`;
    const [{ n: noticesBefore }] = await notices();

    const key = randomUUID();
    const [{ r: first }] = await refund(tx, key, exec.profile_id, pay.receipt_id);
    check("refund succeeds", Boolean(first?.refund_id) && first.receipt_id === pay.receipt_id);

    const [{ r: replay }] = await refund(tx, key, exec.profile_id, pay.receipt_id);
    check("same key replays the original result", replay?.refund_id === first?.refund_id);

    const [{ n: refundRows }] = await tx`select count(*)::int as n from public.payment_refunds where receipt_id = ${pay.receipt_id}`;
    check("exactly one refund row", refundRows === 1, String(refundRows));
    const [{ n: noticesAfter }] = await notices();
    check("exactly one payment_refunded notice", noticesAfter === noticesBefore + 1, `${noticesBefore} -> ${noticesAfter}`);

    const again = await err(tx, (s) => refund(s, randomUUID(), exec.profile_id, pay.receipt_id));
    check("second refund is refused", again?.code === "23505", again?.message);

    const [after] = await tx`select status from public.payments where id = ${pay.id}`;
    check("payment status unchanged", after.status === pay.status, after.status);
    const obligationsAfter = await tx`select o.id, o.waived_at, o.amount from public.obligations o
      join public.payment_items i on i.obligation_id = o.id where i.payment_id = ${pay.id} order by o.id`;
    check("obligations untouched (waivers kept)", JSON.stringify(obligationsAfter) === JSON.stringify(obligationsBefore),
      `${obligationsBefore.length} linked, ${obligationsBefore.filter((o) => o.waived_at).length} waived`);

    throw ROLLBACK;
  });
} catch (e) {
  if (e !== ROLLBACK) { console.error("FAILED:", e.message); process.exitCode = 1; }
} finally {
  await sql.end();
}

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.note ? `  (${r.note})` : ""}`);
if (results.some((r) => !r.ok)) process.exitCode = 1;
console.log("Rolled back; nothing committed.");
