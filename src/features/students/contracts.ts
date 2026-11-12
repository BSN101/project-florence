import type { Database } from "@/server/db/database.types";

type Functions = Database["public"]["Functions"];
// Generated RPC row types mark every column non-null; these optional parts can be NULL.
type Nullable = { middle_name: string | null; suffix: string | null; email: string | null };

/** One row of florence_roster: a semester enrollment and its student's names. */
export type StudentRosterItem = Omit<Functions["florence_roster"]["Returns"][number], keyof Nullable> & Nullable;

/** One student found by exact number, shown before adding them to the roster. */
export type RosterCandidate = Omit<Functions["florence_roster_candidate"]["Returns"][number], keyof Nullable> & Nullable;

export type StudentActionResult =
  | { success: true; message: string }
  | { success: false; error: string };
