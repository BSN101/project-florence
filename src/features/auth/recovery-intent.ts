import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const recoveryIntentCookieName = "florence-recovery-intent";
export const recoveryIntentMaxAge = 15 * 60;

function signingSecret() {
  const secret = process.env.AUTH_RECOVERY_INTENT_SECRET ?? process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Recovery intent signing configuration is missing");
  return secret;
}

function sign(payload: string) {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

export function createRecoveryIntent(userId: string, now = Date.now()) {
  const expiresAt = Math.floor(now / 1000) + recoveryIntentMaxAge;
  const payload = `${userId}.${expiresAt}.${randomBytes(18).toString("base64url")}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyRecoveryIntent(value: string | undefined, userId: string, now = Date.now()) {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  const [intentUserId, expiresAtValue, nonce, signature] = parts;
  if (intentUserId !== userId || !nonce) return false;

  const expiresAt = Number(expiresAtValue);
  if (!Number.isSafeInteger(expiresAt) || expiresAt < Math.floor(now / 1000)) return false;

  const expected = Buffer.from(sign(`${intentUserId}.${expiresAtValue}.${nonce}`));
  const submitted = Buffer.from(signature);
  return expected.length === submitted.length && timingSafeEqual(expected, submitted);
}

export const recoveryIntentCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/reset-password",
  maxAge: recoveryIntentMaxAge,
};
