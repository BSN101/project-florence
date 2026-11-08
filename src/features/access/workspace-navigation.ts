import type { AccessGrants, Workspace } from "./access-policy";

export type NavigationItem = {
  label: string;
  slug: string;
  semesterScoped?: boolean;
};

export const workspaceLabels: Record<Workspace, string> = {
  student: "Student",
  council: "Council",
  faculty: "Faculty",
  admin: "Platform administration",
};

const studentItems: NavigationItem[] = [
  { label: "Home and attendance QR", slug: "" },
  { label: "Events", slug: "events", semesterScoped: true },
  { label: "Fees and fines", slug: "fees-and-fines", semesterScoped: true },
  { label: "Merits, demerits and services", slug: "merits-demerits-and-services", semesterScoped: true },
  { label: "Clearance", slug: "clearance", semesterScoped: true },
  { label: "Notifications", slug: "notifications" },
];

const councilItems: (NavigationItem & { executiveOnly?: boolean })[] = [
  { label: "Students", slug: "", semesterScoped: true },
  { label: "Events", slug: "events", semesterScoped: true },
  { label: "Fees and fines", slug: "fees-and-fines", semesterScoped: true },
  { label: "Payments", slug: "payments", semesterScoped: true },
  { label: "Merit endorsements and Council demerits", slug: "merit-endorsements-and-council-demerits", semesterScoped: true },
  { label: "Clearance", slug: "clearance", semesterScoped: true },
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
  { label: "Users and access", slug: "" },
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

export function destinationHref(workspace: Workspace, slug: string) {
  return `/${workspace}${slug ? `/${slug}` : ""}`;
}
