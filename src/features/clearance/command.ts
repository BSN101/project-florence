import { randomUUID } from "node:crypto";
import { z } from "zod";

import type { ConfirmCouncilClearanceResult } from "./contracts";

const uuidSchema = z.string().uuid();

/**
 * Pure testable core of confirming Council clearance.
 * Coordinates input validation, authorization, and database RPC dispatch.
 */
export async function executeConfirmCouncilClearance({
  actor,
  rpcClient,
  input,
  revalidate,
}: {
  actor: { id: string; councilRole?: string | null };
  rpcClient: {
    rpc: (
      fn: string,
      params: Record<string, unknown>
    ) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
  };
  input: unknown;
  revalidate: () => void;
}): Promise<ConfirmCouncilClearanceResult> {
  if (
    typeof input !== "object" ||
    input === null ||
    !("studentId" in input) ||
    !("semesterId" in input) ||
    typeof (input as Record<string, unknown>).studentId !== "string" ||
    typeof (input as Record<string, unknown>).semesterId !== "string"
  ) {
    return { success: false, error: "Invalid clearance input" };
  }

  const studentId = (input as { studentId: string }).studentId;
  const semesterId = (input as { semesterId: string }).semesterId;

  if (!uuidSchema.safeParse(studentId).success || !uuidSchema.safeParse(semesterId).success) {
    return { success: false, error: "Invalid clearance input" };
  }

  if (actor.councilRole !== "executive" && actor.councilRole !== "operations") {
    return { success: false, error: "You are not authorized to confirm clearance." };
  }

  if (actor.id === studentId) {
    return { success: false, error: "Self-clearance prohibited" };
  }

  const requestKey = randomUUID();
  const { data, error } = await rpcClient.rpc("confirm_clearance", {
    p_key: requestKey,
    p_actor: actor.id,
    p_student: studentId,
    p_semester: semesterId,
    p_component: "council",
  });

  if (error) {
    if (error.code === "42501" || error.message?.toLowerCase().includes("self clearance")) {
      return { success: false, error: "Self-clearance prohibited" };
    }
    if (error.code === "23505" || error.message?.includes("already confirmed")) {
      return { success: false, error: "Clearance has already been confirmed for this student." };
    }
    return {
      success: false,
      error: error.message || "Failed to confirm clearance. Please try again.",
    };
  }

  revalidate();

  const record = Array.isArray(data) ? data[0] : (data as Record<string, unknown> | null);
  const clearanceId = String(record?.clearance_id ?? record?.id ?? requestKey);
  const confirmedAt = String(record?.confirmed_at ?? new Date().toISOString());

  return {
    success: true,
    clearanceId,
    confirmedAt,
  };
}
