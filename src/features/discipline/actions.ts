"use server";

import { revalidatePath } from "next/cache";

import { AccessDeniedError, requireWorkspace } from "@/server/auth/require-workspace";
import { createCommandClient } from "@/server/db/command-client";
import { getTodayManila } from "./calculations";
import { awardDirectMeritsSchema } from "./schemas";

const RPC_MESSAGES: [string, string][] = [
  ["Award date must be in current academic context", "The award date must fall within the current semester and cannot be in the future."],
  ["Self award forbidden", "You cannot award merits to yourself."],
  ["Student enrollment in the specified semester required", "Not enrolled in the current semester."],
  ["Matching instructor assignment required", "Only Academic or Clinical Instructors can award merits."],
  ["Request key reused", "Already recorded with different details. Check My entries before awarding again."],
  ["Positive days, description and award date required", "Days, reason and award date are required."],
];

// Database messages are not shown as-is; unknown ones get a generic message.
function formatRpcError(message: string): string {
  return RPC_MESSAGES.find(([match]) => message.includes(match))?.[1] ?? "Unable to record this award. Try again.";
}

export type AwardFailure = { studentId: string; error: string };

export type AwardDirectMeritsResult =
  | { success: true; awardedIds: string[] }
  | { success: false; error: string; awardedIds: string[]; failures: AwardFailure[] };

function rejected(error: string): AwardDirectMeritsResult {
  return { success: false, error, awardedIds: [], failures: [] };
}

/**
 * Awards direct whole-day merits to each recipient (FL-030); `award_merits` also notifies the student (FL-044).
 * Each recipient is its own idempotent command, so one failure does not undo or block the others.
 */
export async function awardDirectMeritsAction(rawInput: unknown): Promise<AwardDirectMeritsResult> {
  let actorId: string;
  try {
    actorId = (await requireWorkspace("faculty")).profile.id;
  } catch (err) {
    return rejected(err instanceof AccessDeniedError ? "You are not permitted to award merits." : "Unable to verify your access. Try again.");
  }

  const parsed = awardDirectMeritsSchema.safeParse(rawInput);
  if (!parsed.success) return rejected(parsed.error.issues[0]?.message ?? "Check the award details.");

  const { recipients, days, awardedOn, description } = parsed.data;
  if (awardedOn > getTodayManila()) return rejected("Award date cannot be in the future.");
  if (recipients.some((r) => r.studentId === actorId)) return rejected("You cannot award merits to yourself.");

  const client = createCommandClient();
  const awardedIds: string[] = [];
  const failures: AwardFailure[] = [];

  for (const { studentId, requestKey } of recipients) {
    try {
      const { error } = await client.rpc("award_merits", {
        p_key: requestKey,
        p_actor: actorId,
        p_student: studentId,
        p_days: days,
        p_description: description,
        p_awarded_on: awardedOn,
      });
      if (error) failures.push({ studentId, error: formatRpcError(error.message) });
      else awardedIds.push(studentId);
    } catch {
      failures.push({ studentId, error: "Unable to reach the server. Try again." });
    }
  }

  if (awardedIds.length) revalidatePath("/faculty/my-merits-and-demerits");
  if (!failures.length) return { success: true, awardedIds };
  return {
    success: false,
    error: awardedIds.length ? "Some awards were not recorded." : "No awards were recorded.",
    awardedIds,
    failures,
  };
}
