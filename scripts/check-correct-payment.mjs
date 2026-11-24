// Rollback-only check of the T-039 correct_payment SQL against the linked database.
// Applies pending migrations plus smoke checks in ONE transaction, then rolls back.
// Nothing is committed. Run: node --env-file=.env.local scripts/check-correct-payment.mjs
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
const skip = (name, why) => check(name, true, `skipped: ${why}`);

// Runs fn in a savepoint and returns the Postgres error code and message it raised, or null.
async function err(tx, fn) {
  try { await tx.savepoint(fn); return null; } catch (e) { return { code: e.code, message: e.message }; }
}
const correct = (tx, key, actor, payment, obligations) =>
  tx`select public.correct_payment(${key}, ${actor}, ${payment}, ${obligations}::uuid[], ${"rollback check"}) as r`;
const itemsOf = async (tx, paymentId) =>
  (await tx`select obligation_id from public.payment_items where payment_id = ${paymentId} order by obligation_id`)
    .map((r) => r.obligation_id);

try {
  await sql.begin(async (tx) => {
    [{ now: dbNow }] = await tx`select now()`;
    for (const file of PENDING) await tx.unsafe(body(file));
    check(`pending migrations apply (${PENDING.length})`, true);

    const sig = "public.correct_payment(uuid,uuid,uuid,uuid[],text)";
    const [acl] = await tx`select has_function_privilege('authenticated', ${sig}, 'execute') as auth,
      has_function_privilege('anon', ${sig}, 'execute') as anon,
      has_function_privilege('service_role', ${sig}, 'execute') as service`;
    check("correct_payment is service_role only", acl.service && !acl.auth && !acl.anon);

    const [exec] = await tx`select c.profile_id from public.council_memberships c
      join public.profiles p on p.id = c.profile_id
      where c.removed_at is null and c.access_role = 'executive' and p.account_status = 'active' limit 1`;
    assert(exec, "need an active Council Executive");
    const actor = exec.profile_id;

    // A verified, unrefunded receipt of another student, preferring one with a spare unpaid obligation.
    const [pay] = await tx`select p.id, p.receipt_id, p.student_id, p.semester_id, (
        select o.id from public.obligations o
        where o.student_id = p.student_id and o.semester_id = p.semester_id and o.waived_at is null and o.amount > 0
          and not exists (select 1 from public.payment_items i join public.payments q on q.id = i.payment_id
            where i.obligation_id = o.id and q.record_status = 'current' and q.status in ('pending', 'verified'))
        limit 1) as spare
      from public.payments p
      where p.is_receipt_record and p.record_status = 'current' and p.status = 'verified'
        and p.student_id <> ${actor}
        and not exists (select 1 from public.payment_refunds f where f.receipt_id = p.receipt_id)
      order by (select count(*) from public.payment_items i where i.payment_id = p.id) > 1 desc
      limit 1`;
    assert(pay, "need a verified, unrefunded receipt of another student");
    const oldItems = await itemsOf(tx, pay.id);
    // Drop an item if there are several, otherwise add the spare unpaid obligation.
    const newItems = oldItems.length > 1 ? oldItems.slice(1) : pay.spare ? [...oldItems, pay.spare] : null;

    const missing = await err(tx, (s) => correct(s, randomUUID(), actor, randomUUID(), oldItems));
    check("missing payment says not found", missing?.message === "Payment not found", missing?.message);

    const noop = await err(tx, (s) => correct(s, randomUUID(), actor, pay.id, oldItems));
    check("same items are refused (no-op)", noop?.message === "Replacement items match the current record", noop?.message);

    const [selfPay] = await tx`select p.id from public.payments p
      where p.student_id = ${actor} and p.is_receipt_record and p.record_status = 'current' and p.status = 'verified' limit 1`;
    if (selfPay) {
      const e = await err(tx, async (s) => correct(s, randomUUID(), actor, selfPay.id, await itemsOf(s, selfPay.id)));
      check("self correction is refused", e?.message === "Self payment correction forbidden", e?.message);
    } else skip("self correction is refused", "the Executive has no verified receipt of their own");

    const [rep] = await tx`select c.profile_id from public.council_memberships c
      join public.profiles p on p.id = c.profile_id
      where c.removed_at is null and c.access_role = 'representative' and p.account_status = 'active'
        and not exists (select 1 from public.council_memberships o where o.profile_id = c.profile_id
          and o.removed_at is null and o.access_role <> 'representative') limit 1`;
    if (rep && newItems) {
      const e = await err(tx, (s) => correct(s, randomUUID(), rep.profile_id, pay.id, newItems));
      check("Representative is refused", e?.code === "42501", e?.message);
    } else skip("Representative is refused", rep ? "no replacement selection available" : "no active Representative");

    // An obligation on a current pending transfer, with a verified receipt of the same student and semester.
    const [pend] = await tx`select i.obligation_id, t.id as target from public.payment_items i
      join public.payments q on q.id = i.payment_id and q.status = 'pending' and q.record_status = 'current'
      join public.payments t on t.student_id = q.student_id and t.semester_id = q.semester_id
        and t.is_receipt_record and t.record_status = 'current' and t.status = 'verified'
      where q.student_id <> ${actor}
        and not exists (select 1 from public.payment_items x where x.payment_id = t.id and x.obligation_id = i.obligation_id)
      limit 1`;
    if (pend) {
      const e = await err(tx, async (s) =>
        correct(s, randomUUID(), actor, pend.target, [...(await itemsOf(s, pend.target)), pend.obligation_id]));
      check("pending-transfer obligation is refused", e?.message === "Selected obligation has a pending transfer", e?.message);
    } else skip("pending-transfer obligation is refused", "no current pending transfer beside a verified receipt");

    if (!newItems) {
      skip("refund mismatch / success / replay / already corrected", "receipt has one item and no spare unpaid obligation");
      throw ROLLBACK;
    }

    // Refund inside a savepoint, then a correction whose total differs from the refund.
    const mismatch = await err(tx, async (s) => {
      await s`select public.record_refund(${randomUUID()}, ${actor}, ${pay.receipt_id}, ${dbNow}::timestamptz, ${"rollback check"}, true)`;
      await correct(s, randomUUID(), actor, pay.id, newItems);
    });
    check("refunded receipt refuses a different total", mismatch?.message === "Correction would invalidate full refund history", mismatch?.message);

    const counts = () => tx`select (select count(*) from public.payment_receipts)::int as receipts,
      (select count(*) from public.payment_refunds)::int as refunds`;
    const [before] = await counts();

    const key = randomUUID();
    const [{ r: first }] = await correct(tx, key, actor, pay.id, newItems);
    check("correction succeeds", Boolean(first?.payment_id) && first.supersedes_payment_id === pay.id
      && first.receipt_id === pay.receipt_id);

    const [oldRow] = await tx`select record_status from public.payments where id = ${pay.id}`;
    const [newRow] = await tx`select record_status, supersedes_payment_id, receipt_id, is_receipt_record
      from public.payments where id = ${first.payment_id}`;
    check("old record is superseded", oldRow.record_status === "superseded", oldRow.record_status);
    check("replacement is current, linked and keeps the receipt",
      newRow.record_status === "current" && newRow.supersedes_payment_id === pay.id
        && newRow.receipt_id === pay.receipt_id && newRow.is_receipt_record);
    check("replacement has the new items", JSON.stringify(await itemsOf(tx, first.payment_id)) === JSON.stringify([...newItems].sort()));

    const [{ r: replay }] = await correct(tx, key, actor, pay.id, newItems);
    check("same key replays the original result", replay?.payment_id === first.payment_id);

    const again = await err(tx, (s) => correct(s, randomUUID(), actor, pay.id, oldItems));
    check("new key on a superseded record is refused", again?.message === "Payment was already corrected", again?.message);

    const [after] = await counts();
    check("no money moved (receipts and refunds unchanged)",
      after.receipts === before.receipts && after.refunds === before.refunds);

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
