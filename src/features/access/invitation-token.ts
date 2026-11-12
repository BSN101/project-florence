import { createHash, randomBytes } from "node:crypto";

/** Invitation lifetime; the database accepts up to 30 days. */
export const invitationLifetimeMs = 7 * 24 * 60 * 60 * 1000;

/** 32 random bytes as base64url: always 43 URL-safe characters. */
export const invitationTokenPattern = /^[A-Za-z0-9_-]{43}$/;

export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** The raw token goes only into the email; Florence stores only its hash. */
export function createInvitationToken(now = Date.now()) {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashInvitationToken(token),
    expiresAt: new Date(now + invitationLifetimeMs).toISOString(),
  };
}
