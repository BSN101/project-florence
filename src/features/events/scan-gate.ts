/**
 * A camera reads the same QR many times per second. The gate lets a code through
 * once, then ignores that same code until `cooldownMs` passes without seeing it.
 */
export function createScanGate(cooldownMs: number) {
  const lastSeen = new Map<string, number>();
  return (code: string, now: number): boolean => {
    const previous = lastSeen.get(code);
    lastSeen.set(code, now);
    for (const [key, at] of lastSeen) if (now - at > cooldownMs) lastSeen.delete(key);
    return previous === undefined || now - previous > cooldownMs;
  };
}
