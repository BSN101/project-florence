import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { MisconductCatalog } from "@/features/misconduct/components/misconduct-catalog";
import { getMisconductCatalog } from "@/features/misconduct/queries";

export const instant = false;

export default async function AdminMisconductCatalogPage({ searchParams }: {
  searchParams: Promise<{ semester?: string | string[] }>;
}) {
  const { semester } = await searchParams;
  return (
    <WorkspaceShell workspace="admin" destination="misconduct-catalog" semester={semester}>
      <p className="text-sm text-muted-foreground">
        Options instructors choose from when logging demerits. Every option counts as one demerit per recorded unit. Editing or archiving an option never changes demerits already recorded, and managing the catalog doesn’t grant authority to issue or waive demerits.
      </p>
      <Catalog />
    </WorkspaceShell>
  );
}

// Rendered inside the shell, which has already checked workspace access.
async function Catalog() {
  const options = await getMisconductCatalog().catch(() => null);
  if (!options) return <p role="alert" className="rounded-lg bg-error-surface p-3 text-sm">We couldn’t load the misconduct catalog. Please try again.</p>;
  return <MisconductCatalog options={options} />;
}
