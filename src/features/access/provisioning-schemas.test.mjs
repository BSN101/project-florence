import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addCouncilMemberSchema, changeCouncilMemberSchema, grantExecutiveSchema, provisionFacultySchema, removeCouncilMemberSchema,
  replaceExecutiveSchema,
} from "./provisioning-schemas.ts";

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

const add = { requestKey: key, universityId: "21-1-00001", role: "operations", label: " Treasurer " };

test("council add trims the label and accepts only Operations or Representative", () => {
  assert.equal(addCouncilMemberSchema.parse(add).label, "Treasurer");
  assert.equal(addCouncilMemberSchema.safeParse({ ...add, role: "representative" }).success, true);
  assert.equal(addCouncilMemberSchema.safeParse({ ...add, role: "executive" }).success, false);
  assert.equal(addCouncilMemberSchema.safeParse({ ...add, universityId: "21-1-0001" }).success, false);
  assert.equal(addCouncilMemberSchema.safeParse({ ...add, label: "  " }).success, false);
});

test("council change and remove target a membership id and never Executive", () => {
  assert.equal(changeCouncilMemberSchema.safeParse({ requestKey: key, membershipId: key, role: "representative", label: "Auditor" }).success, true);
  assert.equal(changeCouncilMemberSchema.safeParse({ requestKey: key, membershipId: key, role: "executive", label: "President" }).success, false);
  assert.equal(removeCouncilMemberSchema.safeParse({ requestKey: key, membershipId: "nope" }).success, false);
});
