import "server-only";

import { headers } from "next/headers";

/**
 * The app origin for links in emails, taken from a request whose Origin matches
 * its Host. Next.js already checks Server Action Origin against Host; never use a
 * submitted callback URL.
 */
export async function trustedRequestOrigin(): Promise<string | null> {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  const host = requestHeaders.get("host");
  if (!origin || !host || !/^https?:\/\/[^/]+$/.test(origin) || new URL(origin).host !== host) return null;
  return origin;
}
