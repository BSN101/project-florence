"use server";

import { revalidatePath } from "next/cache";

import { requireWorkspace } from "@/server/auth/require-workspace";
import { createCommandClient } from "@/server/db/command-client";
import { getTodayManila } from "./calculations";
import { awardDirectMeritsSchema, deriveStudentRequestKey } from "./schemas";

function formatRpcError(message: string): string {
  if (message.includes("Award date must be in current academic context and not future")) {
    return "The award date must fall within the active semester date range and cannot be in the future.";
  }
  if (message.includes("Self award forbidden")) {
    return "You cannot award merits to yourself.";
  }
  if (message.includes("Student") || message.includes("student")) {
    return "One or more selected students are not actively enrolled in the current semester.";
  }
  if (message.includes("Positive days, description and award date required")) {
    return "Valid days, description, and award date are required.";
  }
  return message;
}

export type AwardDirectMeritsResult =
  | { success: true; message: string }
  | { success: false; error: string };

/**
 * Server action to award direct whole-day merits to one or more enrolled students (FL-030).
 * Emits in-app student notification automatically within the database RPC (FL-044).
 */
export async function awardDirectMeritsAction(rawInput: unknown): Promise<AwardDirectMeritsResult> {
  const access = await requireWorkspace("faculty");
  const actorId = access.profile.id;

  const parsed = awardDirectMeritsSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid form input.",
    };
  }

  const { submissionKey, studentIds, days, awardedOn, description } = parsed.data;

  const today = getTodayManila();
  if (awardedOn > today) {
    return { success: false, error: "Award date cannot be in the future." };
  }

  // Self-award check
  if (studentIds.includes(actorId)) {
    return { success: false, error: "You cannot award merits to yourself." };
  }

  const client = createCommandClient();

  for (const studentId of studentIds) {
    const pKey = deriveStudentRequestKey(submissionKey, studentId);
    const { error } = await client.rpc("award_merits", {
      p_key: pKey,
      p_actor: actorId,
      p_student: studentId,
      p_days: days,
      p_description: description,
      p_awarded_on: awardedOn,
    });

    if (error) {
      return {
        success: false,
        error: formatRpcError(error.message),
      };
    }
  }

  revalidatePath("/faculty/my-merits-and-demerits");
  return {
    success: true,
    message: `Successfully awarded ${days} ${days === 1 ? "day" : "days"} of merit to ${studentIds.length} ${
      studentIds.length === 1 ? "student" : "students"
    }.`,
  };
}
