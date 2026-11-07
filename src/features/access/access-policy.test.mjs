import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveAccess } from "./access-policy.ts";

const profile = { id: "p", account_status: "active", university_id: "99-1-99001", first_name: "Test", middle_name: null, last_name: "User", suffix: null };
const enrollment = { student_id: "p", semester_id: "old", year_level: 1, academic_status: "regular" };
const role = (name) => ({ profile_id: "p", role: name, removed_at: null });
const membership = (access_role) => ({ profile_id: "p", access_role, removed_at: null });
const faculty = { ...profile, university_id: null };

test("student access uses any enrollment, not just the current semester", () => {
  assert.deepEqual(resolveAccess(profile, [], [], [enrollment])?.workspaces, ["student"]);
  assert.deepEqual(resolveAccess(profile, [], [membership("representative")], [enrollment])?.workspaces, ["student", "council"]);
  assert.equal(resolveAccess(profile, [], [], []) , null);
});

test("faculty requires a matching underlying instructor role", () => {
  assert.deepEqual(resolveAccess(faculty, [role("Academic Instructor"), role("Academic Coordinator")], [], [])?.workspaces, ["faculty"]);
  assert.equal(resolveAccess(faculty, [role("Academic Coordinator")], [], []), null);
  assert.equal(resolveAccess(faculty, [role("Clinical Instructor"), role("Academic Coordinator")], [], []), null);
  assert.equal(resolveAccess(faculty, [role("Clinical Instructor"), role("Academic Instructor")], [], []), null);
});

test("nine synthetic access combinations resolve to their intended workspaces", () => {
  for (const access_role of ["executive", "operations", "representative"]) {
    assert.deepEqual(resolveAccess(profile, [], [membership(access_role)], [enrollment]), {
      workspaces: ["student", "council"], roles: [], councilRole: access_role,
    });
  }
  assert.deepEqual(resolveAccess(profile, [], [], [enrollment])?.workspaces, ["student"]);
  for (const roles of [
    ["Academic Instructor"], ["Academic Instructor", "Academic Coordinator"],
    ["Clinical Instructor"], ["Clinical Instructor", "RLE Coordinator"],
  ]) {
    assert.deepEqual(resolveAccess(faculty, roles.map(role), [], [])?.workspaces, ["faculty"]);
  }
  assert.deepEqual(resolveAccess(faculty, [role("Platform Admin")], [], [])?.workspaces, ["admin"]);
});

test("unlinked or inconsistent identities never acquire a workspace", () => {
  assert.equal(resolveAccess(faculty, [], [membership("representative")], []), null);
  assert.equal(resolveAccess(profile, [role("Clinical Instructor")], [], [enrollment]), null);
  assert.equal(resolveAccess(faculty, [], [], [enrollment]), null);
  assert.equal(resolveAccess(profile, [], [membership("executive")], []), null);
  assert.equal(resolveAccess(profile, [], [{ ...membership("executive"), profile_id: "other" }], [enrollment]), null);
});

test("admin is exclusive; invalid assignments and archived profiles fail closed", () => {
  assert.deepEqual(resolveAccess(faculty, [role("Platform Admin")], [], [])?.workspaces, ["admin"]);
  assert.equal(resolveAccess(faculty, [role("Platform Admin"), role("Academic Instructor")], [], []), null);
  assert.equal(resolveAccess(profile, [role("Platform Admin")], [], [enrollment]), null);
  assert.equal(resolveAccess(profile, [], [membership("executive"), membership("operations")], [enrollment]), null);
  assert.equal(resolveAccess(profile, [], [{ ...membership("executive"), removed_at: "yesterday" }], [enrollment]), null);
  assert.equal(resolveAccess({ ...profile, account_status: "archived" }, [], [], [enrollment]), null);
});
