import assert from "node:assert/strict";
import { test } from "node:test";

import { activateSemesterInTransaction, isMatchingSemesterDatabase } from "./activation.ts";


const ref = "abcdefghijklmnopqrst";
const api = `https://${ref}.supabase.co`;
const db = `postgresql://postgres:test-only@db.${ref}.supabase.co:5432/postgres`;
const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";

test("accepts only a direct or pooler connection for the application project", () => {
  assert.equal(isMatchingSemesterDatabase(db, api), true);
  assert.equal(isMatchingSemesterDatabase(`postgresql://postgres.${ref}:test-only@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`, api), true);
  for (const [connection, application] of [
    [db, "https://otherproject1234567.supabase.co"],
    [`postgresql://postgres:test-only@db.otherproject1234567.supabase.co/postgres`, api],
    [`postgresql://postgres.otherproject1234567:test-only@aws-0-ap-southeast-1.pooler.supabase.com/postgres`, api],
    [`postgresql://postgres:test-only@localhost/postgres`, api],
    [`postgresql://postgres:test-only@db.${ref}.supabase.co/postgres?sslmode=disable`, api],
    [db, undefined],
  ]) assert.equal(isMatchingSemesterDatabase(connection, application), false);
});

function stub(currentId, target = { id: second, academic_year_start: 2026, term: "Midyear", is_current: false }) {
  const queries = [];
  const tx = async (parts, ...values) => {
    const query = parts.join("?").replace(/\s+/g, " ").trim();
    queries.push({ query, values });
    if (query.includes("where is_current = true") && query.startsWith("select")) return currentId ? [{ id: currentId }] : [];
    if (query.includes("from public.semesters where id")) return target ? [target] : [];
    return [];
  };
  return { tx, queries };
}

test("switches only after taking the lock and confirming the prior semester", async () => {
  const { tx, queries } = stub(first);
  const result = await activateSemesterInTransaction(tx, { semesterId: second, expectedCurrentSemesterId: first });
  assert.equal(result.success, true);
  assert.deepEqual(queries.map(({ query }) => query.split(" ")[0]), ["select", "select", "select", "update", "update"]);
  assert.match(queries[0].query, /pg_advisory_xact_lock/);
  assert.match(queries[3].query, /is_current = false/);
  assert.match(queries[4].query, /is_current = true/);
  assert.deepEqual(queries[4].values, [second]);
});

test("first activation allows no previous current semester", async () => {
  const { tx, queries } = stub(null);
  const result = await activateSemesterInTransaction(tx, { semesterId: second, expectedCurrentSemesterId: null });
  assert.equal(result.success, true);
  assert.equal(queries.filter(({ query }) => query.startsWith("update")).length, 2);
});

test("stale confirmation cannot deactivate the new current semester", async () => {
  const { tx, queries } = stub(second);
  const result = await activateSemesterInTransaction(tx, { semesterId: first, expectedCurrentSemesterId: null });
  assert.equal(result.success, false);
  assert.match(result.error, /Refresh/);
  assert.equal(queries.filter(({ query }) => query.startsWith("update")).length, 0);
});

test("missing target does not clear the previous current semester", async () => {
  const { tx, queries } = stub(first, null);
  const result = await activateSemesterInTransaction(tx, { semesterId: second, expectedCurrentSemesterId: first });
  assert.equal(result.success, false);
  assert.equal(queries.filter(({ query }) => query.startsWith("update")).length, 0);
});


test("already-current target is a no-op after the expected-current check", async () => {
  const { tx, queries } = stub(second, { id: second, academic_year_start: 2026, term: "Midyear", is_current: true });
  const result = await activateSemesterInTransaction(tx, { semesterId: second, expectedCurrentSemesterId: second });
  assert.equal(result.success, true);
  assert.equal(queries.filter(({ query }) => query.startsWith("update")).length, 0);
});
