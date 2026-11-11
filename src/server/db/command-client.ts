import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Isolated service-role client for authorized server commands.
 * Service-role access bypasses RLS: always authorize the actor and action
 * in application code before running mutations.
 * Never attach user cookies or sessions to this client.
 */
export function createCommandClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Supabase service-role client configuration is missing");
  }

  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export type CommandClient = ReturnType<typeof createCommandClient>;
