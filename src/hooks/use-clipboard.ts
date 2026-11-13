"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseClipboardOptions {
  timeout?: number;
}

export function useClipboard({ timeout = 2000 }: UseClipboardOptions = {}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const copy = useCallback(
    async (text: string, key = "default"): Promise<boolean> => {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedKey(key);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          setCopiedKey(null);
        }, timeout);
        return true;
      } catch {
        return false;
      }
    },
    [timeout],
  );

  const isCopied = useCallback(
    (key = "default"): boolean => copiedKey === key,
    [copiedKey],
  );

  return {
    copy,
    copiedKey,
    isCopied,
  };
}
