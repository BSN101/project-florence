export type NameParts = {
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  suffix?: string | null;
};

/** Formats a full name in natural reading order: "First Middle Last, Suffix" */
export function displayName(p: NameParts): string {
  return [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(" ") + (p.suffix ? `, ${p.suffix}` : "");
}

/** Formats a name in alphabetical sorting order: "Last, First Middle, Suffix" */
export function sortName(p: NameParts): string {
  return `${p.last_name}, ${[p.first_name, p.middle_name].filter(Boolean).join(" ")}${p.suffix ? `, ${p.suffix}` : ""}`;
}
