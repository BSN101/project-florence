"use server";

import { revalidatePath } from "next/cache";

import { createCommandClient } from "@/server/db/command-client";
import { executeConfirmCouncilClearance } from "./command";
import type { ConfirmCouncilClearanceResult } from "./contracts";
import { assertAuthorizedCouncilClearanceManager } from "./queries";
import type { ConfirmCouncilClearanceInput } from "./schemas";

export { executeConfirmCouncilClearance };

/**
 * Server action to confirm Council clearance for a student (FL-040).
 * Authorized for Council Executive and Council Operations only.
 */
export async function confirmCouncilClearanceAction(
  input: ConfirmCouncilClearanceInput
): Promise<ConfirmCouncilClearanceResult> {
  try {
    const context = await assertAuthorizedCouncilClearanceManager();
    const commandClient = createCommandClient();

    return await executeConfirmCouncilClearance({
      actor: { id: context.profile.id, councilRole: context.councilRole },
      rpcClient: commandClient as unknown as {
        rpc: (
          fn: string,
          params: Record<string, unknown>
        ) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
      },
      input,
      revalidate: () => {
        revalidatePath("/council/clearance");
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message === "forbidden") {
      return { success: false, error: "You are not authorized to confirm clearance." };
    }
    return { success: false, error: "An unexpected error occurred while confirming clearance." };
  }
}
