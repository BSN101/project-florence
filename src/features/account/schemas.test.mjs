import assert from "node:assert/strict";
import { test } from "node:test";

import { changePasswordSchema } from "./schemas.ts";

const valid = {
  currentPassword: "current-password-123",
  newPassword: "new-password-456",
  confirmation: "new-password-456",
};

test("account password changes require the current password", () => {
  assert.equal(changePasswordSchema.safeParse(valid).success, true);
  assert.equal(changePasswordSchema.safeParse({ ...valid, currentPassword: "" }).success, false);
  assert.equal(changePasswordSchema.safeParse({ ...valid, currentPassword: new File([], "password") }).success, false);
});

test("account password changes require a distinct matching new password", () => {
  assert.equal(changePasswordSchema.safeParse({ ...valid, confirmation: "different-password" }).success, false);
  assert.equal(changePasswordSchema.safeParse({ ...valid, newPassword: valid.currentPassword, confirmation: valid.currentPassword }).success, false);
  assert.equal(changePasswordSchema.safeParse({ ...valid, newPassword: "short", confirmation: "short" }).success, false);
});

test("password policy measures UTF-8 bytes", () => {
  const multibyte = "😊".repeat(19);
  assert.equal(changePasswordSchema.safeParse({ ...valid, newPassword: multibyte, confirmation: multibyte }).success, false);
});
