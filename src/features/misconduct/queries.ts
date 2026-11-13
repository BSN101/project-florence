import "server-only";

import { requirePlatformAdmin } from "@/features/access/provisioning-service";
import { createUserClient } from "@/server/db/user-client";

/** Whole catalog for Platform Admin: Other first, then active and archived options by label. */
export async function getMisconductCatalog() {
  await requirePlatformAdmin();
  const client = await createUserClient();
  const { data, error } = await client.from("misconduct_catalog").select("id, label, is_other, archived_at, updated_at")
    .order("is_other", { ascending: false }).order("label");
  if (error) throw new Error("Unable to load the misconduct catalog");
  return data;
}

export type MisconductOption = Awaited<ReturnType<typeof getMisconductCatalog>>[number];
