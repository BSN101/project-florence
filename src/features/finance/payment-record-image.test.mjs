import assert from "node:assert/strict";
import { test } from "node:test";

import { prefersShareSheet } from "./payment-record-image.ts";

test("save as photo shares only on touch devices that can share files", () => {
  assert.equal(prefersShareSheet(true, true), true); // phone
  assert.equal(prefersShareSheet(false, true), false); // desktop with Web Share: download
  assert.equal(prefersShareSheet(true, false), false); // phone without file sharing: download
  assert.equal(prefersShareSheet(false, false), false);
});
