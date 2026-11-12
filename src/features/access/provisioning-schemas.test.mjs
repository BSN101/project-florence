import assert from "node:assert/strict";
import { test } from "node:test";

import { grantExecutiveSchema, provisionFacultySchema, replaceExecutiveSchema } from "./provisioning-schemas.ts";

const key = "6f1c2f8e-6b9b-4a3e-9f53-1e8a4b0b6a11";
const faculty = { requestKey: key, firstName: " Ana ", lastName: "dela Cruz", email: " Ana@Example.COM ", instructorRole: "Academic Instructor", coordinator: true };

test("faculty input normalizes names and email, and blanks optional names", () => {
  const parsed = provisionFacultySchema.parse({ ...faculty, middleName: "  ", suffix: "" });
  assert.equal(parsed.firstName, "Ana");
  assert.equal(parsed.email, "ana@example.com");
  assert.equal(parsed.middleName, null);
  assert.equal(parsed.suffix, null);
});

test("faculty input requires a request key, a valid email and one instructor role", () => {
  assert.equal(provisionFacultySchema.safeParse({ ...faculty, requestKey: "not-a-uuid" }).success, false);
  assert.equal(provisionFacultySchema.safeParse({ ...faculty, email: "nope" }).success, false);
  assert.equal(provisionFacultySchema.safeParse({ ...faculty, instructorRole: "Platform Admin" }).success, false);
  assert.equal(provisionFacultySchema.safeParse({ ...faculty, firstName: "  " }).success, false);
});

test("executive inputs require an exact university number and a non-Executive replacement", () => {
  assert.equal(grantExecutiveSchema.safeParse({ requestKey: key, universityId: "21-1-00001", label: "President" }).success, true);
  assert.equal(grantExecutiveSchema.safeParse({ requestKey: key, universityId: "21-1-0001", label: "President" }).success, false);
  assert.equal(grantExecutiveSchema.safeParse({ requestKey: key, universityId: "21-1-00001", label: " " }).success, false);
  assert.equal(replaceExecutiveSchema.safeParse({ requestKey: key, profileId: key, accessRole: "executive", label: "x" }).success, false);
});
