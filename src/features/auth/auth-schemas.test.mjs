import assert from "node:assert/strict";
import { test } from "node:test";

import { passwordResetRequestSchema, signInSchema, updatePasswordSchema } from "./auth-schemas.ts";

test("auth email schemas trim and validate submitted addresses", () => {
  assert.equal(signInSchema.parse({ email: " user@example.com ", password: "secret" }).email, "user@example.com");
  assert.equal(passwordResetRequestSchema.safeParse({ email: "invalid" }).success, false);
  assert.equal(signInSchema.safeParse({ email: new File([], "email"), password: "secret" }).success, false);
});

test("password update schema enforces length and matching confirmation", () => {
  assert.equal(updatePasswordSchema.safeParse({ password: "long-enough-password", confirmation: "long-enough-password" }).success, true);
  assert.equal(updatePasswordSchema.safeParse({ password: "too-short", confirmation: "too-short" }).success, false);
  assert.equal(updatePasswordSchema.safeParse({ password: "long-enough-password", confirmation: "different-password" }).success, false);
});
