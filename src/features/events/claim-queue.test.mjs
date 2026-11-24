import assert from "node:assert/strict";
import { test } from "node:test";

import { canVerify, groupClaims, nextClaim } from "./claim-queue.ts";

const claim = (id, student_id, kind, submitted_at) => ({ id, student_id, kind, submitted_at });
const claims = [
  claim("b-out", "ben", "time_out", "2026-11-24T04:10:00Z"),
  claim("a-in", "ana", "time_in", "2026-11-24T00:05:00Z"),
  claim("a-out", "ana", "time_out", "2026-11-24T04:03:00Z"),
  claim("c-in", "carla", "time_in", "2026-11-24T00:15:00Z"),
];

test("groups one row per student, longest-waiting first", () => {
  const groups = groupClaims(claims, new Map());
  assert.deepEqual(groups.map((g) => g.student_id), ["ana", "carla", "ben"]);
  assert.equal(groups[0].time_in.id, "a-in");
  assert.equal(groups[0].time_out.id, "a-out");
  assert.equal(groups[2].time_in, undefined);
});

test("reviews time-in before time-out", () => {
  const [ana] = groupClaims(claims, new Map());
  assert.equal(nextClaim(ana).id, "a-in");
  const [after] = groupClaims(claims, new Map([["a-in", "verify"]]));
  assert.equal(after.student_id, "carla");
  const anaAfter = groupClaims(claims, new Map([["a-in", "verify"]])).find((g) => g.student_id === "ana");
  assert.equal(nextClaim(anaAfter).id, "a-out");
});

test("rejecting a time-in drops that student's waiting time-out", () => {
  const groups = groupClaims(claims, new Map([["a-in", "reject"]]));
  assert.equal(groups.some((g) => g.student_id === "ana"), false);
});

test("a time-out needs a recorded time-in before it can be verified", () => {
  const out = claims[0];
  assert.equal(canVerify(out, false), false);
  assert.equal(canVerify(out, true), true);
  assert.equal(canVerify(claims[1], false), true);
});
