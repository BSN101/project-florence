import { FacultyClearancePageContent } from "@/features/clearance/components/faculty-clearance-page-content";

export const instant = false;

export default function FacultyRleClearancePage({
  searchParams,
}: {
  searchParams: Promise<{ semester?: string | string[] }>;
}) {
  return <FacultyClearancePageContent component="rle" searchParams={searchParams} />;
}
