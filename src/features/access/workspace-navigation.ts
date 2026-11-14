import type { AccessGrants, Workspace } from "./access-policy";

export type NavigationItem = {
  label: string;
  slug: string;
  semesterScoped?: boolean;
  /** Renders under a collapsible sidebar group; the list itself stays flat. */
  group?: string;
  /** Phone tab-bar label. Items with one become bottom tabs; the rest go under "More". */
  shortLabel?: string;
};

export const workspaceLabels: Record<Workspace, string> = {
  student: "Student",
  council: "Council",
  faculty: "Faculty",
  admin: "Platform administration",
};

const studentItems: NavigationItem[] = [
  { label: "Home and attendance QR", slug: "", shortLabel: "Home" },
  { label: "Events", slug: "events", semesterScoped: true, shortLabel: "Events" },
  { label: "Fees and fines", slug: "fees-and-fines", semesterScoped: true, shortLabel: "Fees" },
  { label: "Merits, demerits and services", slug: "merits-demerits-and-services", semesterScoped: true, shortLabel: "Merits" },
  { label: "Clearance", slug: "clearance", semesterScoped: true, shortLabel: "Clearance" },
  { label: "Notifications", slug: "notifications" },
];

const councilItems: (NavigationItem & { executiveOnly?: boolean })[] = [
  { label: "Students", slug: "", semesterScoped: true, shortLabel: "Students" },
  { label: "Events", slug: "events", semesterScoped: true, shortLabel: "Events" },
  { label: "Fees and fines", slug: "fees-and-fines", semesterScoped: true },
  { label: "Payments", slug: "payments", semesterScoped: true, shortLabel: "Payments" },
  { label: "Merit endorsements and Council demerits", slug: "merit-endorsements-and-council-demerits", semesterScoped: true },
  { label: "Clearance", slug: "clearance", semesterScoped: true, shortLabel: "Clearance" },
  { label: "Reports", slug: "reports", semesterScoped: true },
  { label: "Semesters", slug: "semesters" },
  { label: "Council members", slug: "council-members", executiveOnly: true },
  { label: "Payment accounts", slug: "payment-accounts", executiveOnly: true },
];

const facultyItems: NavigationItem[] = [
  { label: "Students", slug: "", semesterScoped: true },
  { label: "My merits and demerits", slug: "my-merits-and-demerits", semesterScoped: true },
  { label: "Merit endorsements", slug: "merit-endorsements", semesterScoped: true },
  { label: "Service sessions", slug: "service-sessions", semesterScoped: true },
];

const adminItems: NavigationItem[] = [
  { label: "Faculty", slug: "users/faculty", group: "Users and access" },
  { label: "Executives", slug: "users/executives", group: "Users and access" },
  { label: "Misconduct catalog", slug: "misconduct-catalog" },
];

export function getWorkspaceNavigation(workspace: Workspace, access: AccessGrants): NavigationItem[] {
  if (workspace === "student") return studentItems;
  if (workspace === "admin") return adminItems;
  if (workspace === "council") {
    if (access.councilRole === "representative") return councilItems.filter((item) => item.slug === "events");
    return councilItems.filter((item) => !item.executiveOnly || access.councilRole === "executive");
  }

  const items = [...facultyItems];
  if (access.roles.includes("Academic Coordinator")) {
    items.push({ label: "Academic clearance", slug: "academic-clearance", semesterScoped: true });
  }
  if (access.roles.includes("RLE Coordinator")) {
    items.push(
      { label: "RLE clearance", slug: "rle-clearance", semesterScoped: true },
      { label: "External CI records", slug: "external-ci-records", semesterScoped: true },
    );
  }
  return items;
}

/** Phone tab bar only when there is more than one tab; Representatives (Events only) get none. */
export function hasMobileTabBar(navigation: NavigationItem[]) {
  return navigation.filter((item) => item.shortLabel).length > 1;
}

export function destinationHref(workspace: Workspace, slug: string) {
  return `/${workspace}${slug ? `/${slug}` : ""}`;
}
