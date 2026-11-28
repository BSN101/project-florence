import type { ExternalCiEntryFailure } from "./contracts";

/** `requestKey` stays null until the first submit, then is kept for locked retries. */
export type PickedRecipient = { studentId: string; requestKey: string | null };

export type BatchReconciliation =
  | { kind: "pre_rpc_error"; picked: PickedRecipient[]; locked: boolean; error: string }
  | {
      kind: "result";
      picked: PickedRecipient[];
      locked: boolean;
      hadTransportUncertainty: boolean;
      /** Students recorded across this attempt and every earlier attempt of the same batch. */
      succeededIds: string[];
    };

/**
 * Turns one multi-recipient submission outcome into the next retry state:
 * - Pre-RPC rejections clear lazy keys only when `!wasLocked`, so locked retries resend the same keys.
 * - Clean success clears pending recipients and unlocks.
 * - Partial failures keep only `retryable` recipients, with their keys, in the locked retry queue;
 *   succeeded and deterministic failures leave it.
 */
export function reconcileBatchOutcome({
  preparedRecipients,
  success,
  succeededIds,
  failures,
  error,
  wasLocked,
  previousSucceededIds = [],
}: {
  preparedRecipients: PickedRecipient[];
  success: boolean;
  succeededIds: string[];
  failures: ExternalCiEntryFailure[];
  error?: string;
  wasLocked: boolean;
  previousSucceededIds?: string[];
}): BatchReconciliation {
  if (!success && succeededIds.length === 0 && failures.length === 0) {
    return {
      kind: "pre_rpc_error",
      picked: wasLocked
        ? preparedRecipients
        : preparedRecipients.map((p) => ({ studentId: p.studentId, requestKey: null })),
      locked: wasLocked,
      error: error ?? "Unable to record these entries. Try again.",
    };
  }

  const allSucceeded = [...new Set([...previousSucceededIds, ...succeededIds])];
  const retryableIds = new Set(failures.filter((f) => f.retryable).map((f) => f.studentId));
  if (!success && retryableIds.size > 0) {
    return {
      kind: "result",
      picked: preparedRecipients.filter((p) => retryableIds.has(p.studentId)),
      locked: true,
      hadTransportUncertainty: true,
      succeededIds: allSucceeded,
    };
  }

  return { kind: "result", picked: [], locked: false, hadTransportUncertainty: false, succeededIds: allSucceeded };
}
