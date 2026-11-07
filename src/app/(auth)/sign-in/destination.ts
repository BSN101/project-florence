const destinations = ["/student", "/council", "/faculty", "/admin"] as const;

export function safeDestination(value: unknown): (typeof destinations)[number] | null {
  return typeof value === "string" && destinations.some((path) => path === value)
    ? value as (typeof destinations)[number] : null;
}
