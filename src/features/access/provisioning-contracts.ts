import type { Database } from "@/server/db/database.types";

export type ArchiveBlockers = {
  pending_endorsements: string[];
  open_service_sessions: string[];
  unwaived_issued_demerits: number;
};

export type ProvisioningResult =
  | { success: true; message: string }
  | { success: false; error: string; blockers?: ArchiveBlockers };

/** One student found by exact university number, shown before granting Executive access. */
export type ExecutiveCandidate = Database["public"]["Functions"]["florence_executive_candidate"]["Returns"][number];

/** One row of florence_provisioning_accounts: a Faculty profile or a current Executive. */
export type ProvisioningAccount = Database["public"]["Functions"]["florence_provisioning_accounts"]["Returns"][number];
