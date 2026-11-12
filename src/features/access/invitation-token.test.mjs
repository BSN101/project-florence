import assert from "node:assert/strict";
import { test } from "node:test";

import { createInvitationToken, hashInvitationToken, invitationLifetimeMs, invitationTokenPattern } from "./invitation-token.ts";

test("invitation tokens are URL-safe, unique and stored only as a SHA-256 hex hash", () => {
  const a = createInvitationToken(0);
  const b = createInvitationToken(0);
  assert.match(a.token, invitationTokenPattern);
  assert.notEqual(a.token, b.token);
  // Matches the database check: lowercase SHA-256 hex.
  assert.match(a.tokenHash, /^[0-9a-f]{64}$/);
  assert.equal(a.tokenHash, hashInvitationToken(a.token));
  assert.notEqual(a.tokenHash, a.token);
});

test("invitation expiry is seven days and within the database's 30-day limit", () => {
  assert.equal(createInvitationToken(0).expiresAt, new Date(invitationLifetimeMs).toISOString());
  assert.equal(invitationLifetimeMs, 7 * 24 * 60 * 60 * 1000);
  assert.ok(invitationLifetimeMs <= 30 * 24 * 60 * 60 * 1000);
});

test("token pattern rejects malformed or oversized input", () => {
  for (const bad of ["", "short", "a".repeat(44), "a".repeat(42) + "=", "a".repeat(42) + "/"]) {
    assert.equal(invitationTokenPattern.test(bad), false, bad);
  }
});
