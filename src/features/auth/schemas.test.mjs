import assert from "node:assert/strict";
import { test } from "node:test";

import { authorizedDestination, defaultWorkspaceDestination, safeDestination } from "./destinations.ts";
import { passwordRecoverySchema, passwordResetRequestSchema, signInSchema } from "./schemas.ts";

test("auth email schemas trim and validate submitted addresses", () => {
  assert.equal(signInSchema.parse({ email: " user@example.com ", password: "secret" }).email, "user@example.com");
  assert.equal(passwordResetRequestSchema.safeParse({ email: "invalid" }).success, false);
  assert.equal(signInSchema.safeParse({ email: new File([], "email"), password: "secret" }).success, false);
});

test("password recovery schema remains independent and validates submitted values", () => {
  assert.equal(passwordRecoverySchema.safeParse({ password: "long-enough-password", confirmation: "long-enough-password" }).success, true);
  assert.equal(passwordRecoverySchema.safeParse({ password: "too-short", confirmation: "too-short" }).success, false);
  assert.equal(passwordRecoverySchema.safeParse({ password: "long-enough-password", confirmation: "different-password" }).success, false);
  assert.equal(passwordRecoverySchema.safeParse({ password: new File([], "password"), confirmation: "long-enough-password" }).success, false);
});

test("safe destinations include account and authorize only available workspaces", () => {
  assert.equal(safeDestination("/account"), "/account");
  assert.equal(safeDestination("//example.com"), null);
  assert.equal(authorizedDestination("/account", ["student"]), "/account");
  assert.equal(authorizedDestination("/admin", ["student"]), null);
  assert.equal(authorizedDestination("/student", ["student"]), "/student");
  assert.equal(defaultWorkspaceDestination(["council", "student"]), "/council");
});
