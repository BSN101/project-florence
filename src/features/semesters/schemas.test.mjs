import assert from "node:assert/strict";
import { test } from "node:test";

import { semesterFilterSchema } from "./schemas.ts";

test("semester filter accepts one UUID and rejects malformed or repeated values", () => {
  assert.equal(semesterFilterSchema.safeParse({}).success, true);
  assert.equal(semesterFilterSchema.safeParse({ semester: "11111111-1111-4111-8111-111111111111" }).success, true);
  assert.equal(semesterFilterSchema.safeParse({ semester: "not-a-semester" }).success, false);
  assert.equal(semesterFilterSchema.safeParse({ semester: ["11111111-1111-4111-8111-111111111111"] }).success, false);
});
