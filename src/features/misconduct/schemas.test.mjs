import assert from "node:assert/strict";
import { test } from "node:test";

import { saveMisconductOptionSchema } from "./schemas.ts";

const requestKey = "11111111-1111-4111-8111-111111111111";

test("labels are trimmed and limited to 200 characters", () => {
  assert.equal(saveMisconductOptionSchema.parse({ requestKey, optionId: null, label: "  Tardiness " }).label, "Tardiness");
  assert.equal(saveMisconductOptionSchema.safeParse({ requestKey, optionId: null, label: "   " }).success, false);
  assert.equal(saveMisconductOptionSchema.safeParse({ requestKey, optionId: null, label: "x".repeat(201) }).success, false);
  assert.equal(saveMisconductOptionSchema.safeParse({ requestKey, optionId: "nope", label: "Tardiness" }).success, false);
});
