import { FacultyClearancePageContent } from "@/features/clearance/components/faculty-clearance-page-content";

export const instant = false;

export default function FacultyAcademicClearancePage({
  searchParams,
}: {
  searchParams: Promise<{ semester?: string | string[] }>;
}) {
  return <FacultyClearancePageContent component="academic" searchParams={searchParams} />;
}
