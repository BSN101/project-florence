"use client";

import { useState, useTransition } from "react";

import type { ProvisioningResult } from "../provisioning-contracts";

/**
 * Keeps one request key per attempt: a double submit or retry after a lost
 * response reuses it, so the database replays instead of acting twice. A new
 * key is issued only after a definite answer.
 */
export function useProvisioningCommand<I extends { requestKey: string }>(action: (input: I) => Promise<ProvisioningResult>) {
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [result, setResult] = useState<ProvisioningResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(input: Omit<I, "requestKey">, onSuccess?: () => void) {
    setResult(null);
    startTransition(async () => {
      try {
        const outcome = await action({ ...input, requestKey } as I);
        setResult(outcome);
        setRequestKey(crypto.randomUUID());
        if (outcome.success) onSuccess?.();
      } catch {
        // Network failure: keep the key so a retry replays the same request.
        setResult({ success: false, error: "We couldn't reach the server. Try again; a retry won't repeat the change." });
      }
    });
  }

  return { run, result, isPending, reset: () => setResult(null) };
}
