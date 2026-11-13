import assert from "node:assert/strict";
import { test } from "node:test";

import { createScanGate } from "./scan-gate.ts";

test("scan gate passes a code once while it stays in view", () => {
  const pass = createScanGate(3000);
  assert.equal(pass("21-1-00001", 0), true);
  assert.equal(pass("21-1-00001", 200), false);
  assert.equal(pass("21-1-00001", 2900), false);
  // Still in view: each sighting extends the cooldown.
  assert.equal(pass("21-1-00001", 5800), false);
});

test("scan gate passes the code again after it left view for the cooldown", () => {
  const pass = createScanGate(3000);
  assert.equal(pass("21-1-00001", 0), true);
  assert.equal(pass("21-1-00001", 3001), true);
});

test("scan gate tracks different codes independently", () => {
  const pass = createScanGate(3000);
  assert.equal(pass("21-1-00001", 0), true);
  assert.equal(pass("21-1-00002", 100), true);
  assert.equal(pass("21-1-00001", 200), false);
});
