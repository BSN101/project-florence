"use server";

import { revalidatePath } from "next/cache";

import { AccessDeniedError } from "@/server/auth/require-workspace";
import { createCommandClient } from "@/server/db/command-client";
import { createUserClient } from "@/server/db/user-client";
import {
  canConfirmCouncilClearance,
  canConfirmFacultyClearance,
} from "./authorization";
import {
  FACULTY_CLEARANCE_CONFIG,
  type ConfirmCouncilClearanceResult,
  type ConfirmFacultyClearanceResult,
} from "./contracts";
import {
  assertAuthorizedCouncilClearanceManager,
  assertAuthorizedFacultyClearanceManager,
} from "./queries";
import {
  confirmCouncilClearanceSchema,
  confirmFacultyClearanceSchema,
} from "./schemas";

const RPC_MESSAGES: [string, string][] = [
  ["Self clearance forbidden", "You can't confirm your own clearance."],
  ["Council action not authorized", "Your Council access no longer allows confirming clearance."],
  ["Matching coordinator assignment required", "You must have the matching Coordinator role to confirm this clearance."],
  ["Council clearance for same semester is required", "Council clearance must be confirmed first for this student in this semester."],
  ["Active Auth-linked human actor required", "Your account is not active. Sign in again."],
  ["Student enrollment in the specified semester required", "This student is not enrolled in the selected semester."],
  ["Request key reused", "This confirmation was already sent with different details. Refresh and try again."],
  ["Invalid clearance component", "Invalid clearance component."],
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

/**
 * Permanently records Faculty clearance (Academic or RLE) for a student and semester (FL-041).
 * Requires matching Coordinator role, prerequisite Council clearance, and current active semester.
 * Disciplinary balance remains visible but is not an automatic blocker.
 */
export async function confirmFacultyClearanceAction(rawInput: unknown): Promise<ConfirmFacultyClearanceResult> {
  const parsed = confirmFacultyClearanceSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: "Invalid clearance details. Refresh and try again." };
  }
  const { studentId, semesterId, component, requestKey } = parsed.data;

  let context: Awaited<ReturnType<typeof assertAuthorizedFacultyClearanceManager>>;
  try {
    context = await assertAuthorizedFacultyClearanceManager(component);
  } catch (err) {
    return {
      success: false,
      error: err instanceof AccessDeniedError ? "You are not permitted to confirm clearance." : "Unable to verify your access. Try again.",
    };
  }

  const isCurrentSemester = context.currentSemester?.id === semesterId;

  // Prerequisite check: Council clearance must already be confirmed (FL-041)
  const client = await createUserClient();
  const { data: councilClearance } = await client
    .from("clearances")
    .select("id")
    .eq("student_id", studentId)
    .eq("semester_id", semesterId)
    .eq("component", "council")
    .maybeSingle();

  const preCheck = canConfirmFacultyClearance({
    actorProfileId: context.profile.id,
    studentId,
    roles: context.roles,
    component,
    councilCleared: Boolean(councilClearance),
    isCurrentSemester,
  });

  if (!preCheck.allowed) {
    if (preCheck.reason === "historical_semester_readonly") {
      return { success: false, error: "Clearance can only be confirmed for the active current semester." };
    }
    if (preCheck.reason === "self_clearance_prohibited") {
      return { success: false, error: "You can't confirm your own clearance." };
    }
    if (preCheck.reason === "council_clearance_required") {
      return { success: false, error: "Council clearance is required before faculty clearance can be confirmed." };
    }
    return { success: false, error: "You are not permitted to confirm clearance." };
  }

  try {
    const { data, error } = await createCommandClient().rpc("confirm_clearance", {
      p_key: requestKey,
      p_actor: context.profile.id,
      p_student: studentId,
      p_semester: semesterId,
      p_component: component,
    });
    if (error) return { success: false, error: formatRpcError(error.message) };

    const targetPath = FACULTY_CLEARANCE_CONFIG[component].path;
    revalidatePath(targetPath);
    const record = data as { clearance_id: string; confirmed_at: string };
    return { success: true, clearanceId: record.clearance_id, confirmedAt: record.confirmed_at };
  } catch {
    return { success: false, error: "Unable to reach the server. Try again." };
  }
}

