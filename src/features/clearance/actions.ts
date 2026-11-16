"use server";

import { revalidatePath } from "next/cache";

import { AccessDeniedError } from "@/server/auth/require-workspace";
import { createCommandClient } from "@/server/db/command-client";
import { canConfirmCouncilClearance } from "./authorization";
import type { ConfirmCouncilClearanceResult } from "./contracts";
import { assertAuthorizedCouncilClearanceManager } from "./queries";
import { confirmCouncilClearanceSchema } from "./schemas";

const RPC_MESSAGES: [string, string][] = [
  ["Self clearance forbidden", "You can't confirm your own clearance."],
  ["Council action not authorized", "Your Council access no longer allows confirming clearance."],
  ["Active Auth-linked human actor required", "Your account is not active. Sign in again."],
  ["Student enrollment in the specified semester required", "This student is not enrolled in the selected semester."],
  ["Request key reused", "This confirmation was already sent with different details. Refresh and try again."],
];

// Database messages are not shown as-is; unknown ones get a generic message.
function formatRpcError(message: string): string {
  return RPC_MESSAGES.find(([match]) => message.includes(match))?.[1] ?? "Unable to confirm clearance. Try again.";
}

function rejected(error: string): ConfirmCouncilClearanceResult {
  return { success: false, error };
}

/**
 * Permanently records Council clearance for a student and semester (FL-040).
 * Council Executive and Operations only; no self-clearance. Balances and demerits are not changed.
 */
export async function confirmCouncilClearanceAction(rawInput: unknown): Promise<ConfirmCouncilClearanceResult> {
  let context: Awaited<ReturnType<typeof assertAuthorizedCouncilClearanceManager>>;
  try {
    context = await assertAuthorizedCouncilClearanceManager();
  } catch (err) {
    return rejected(err instanceof AccessDeniedError ? "You are not permitted to confirm clearance." : "Unable to verify your access. Try again.");
  }

  const parsed = confirmCouncilClearanceSchema.safeParse(rawInput);
  if (!parsed.success) return rejected("Invalid clearance details. Refresh and try again.");
  const { studentId, semesterId, requestKey } = parsed.data;

  const check = canConfirmCouncilClearance({ actorProfileId: context.profile.id, studentId, councilRole: context.councilRole });
  if (!check.allowed) {
    return rejected(check.reason === "self_clearance_prohibited" ? "You can't confirm your own clearance." : "You are not permitted to confirm clearance.");
  }

  try {
    const { data, error } = await createCommandClient().rpc("confirm_clearance", {
      p_key: requestKey,
      p_actor: context.profile.id,
      p_student: studentId,
      p_semester: semesterId,
      p_component: "council",
    });
    if (error) return rejected(formatRpcError(error.message));

    revalidatePath("/council/clearance");
    const record = data as { clearance_id: string; confirmed_at: string };
    return { success: true, clearanceId: record.clearance_id, confirmedAt: record.confirmed_at };
  } catch {
    return rejected("Unable to reach the server. Try again.");
  }
}
