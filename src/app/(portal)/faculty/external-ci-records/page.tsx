import Link from "next/link";
import { connection } from "next/server";
import { AlertCircle, FileWarning, Info, Plus } from "lucide-react";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ExternalCiRecordsView } from "@/features/discipline/components/external-ci-records-view";
import { RecordExternalCiDemeritsFlow } from "@/features/discipline/components/record-external-ci-demerits-flow";
import { RecordExternalCiMeritsFlow } from "@/features/discipline/components/record-external-ci-merits-flow";
import type { AwardRecipientOption } from "@/features/discipline/contracts";
import {
  getActiveMisconductCatalog,
  getExternalCiDemerits,
  getExternalCiMerits,
} from "@/features/discipline/queries";
import { resolveSelectedSemester, semesterFilterSchema } from "@/features/semesters/schemas";
import { getRoster } from "@/features/students/queries";
import { getAccessContext } from "@/server/auth/access-context";

export const instant = false;

const path = "/faculty/external-ci-records";

function toActiveRecipients(
  roster: Awaited<ReturnType<typeof getRoster>>,
  actorId: string
): AwardRecipientOption[] {
  return roster
    .filter((s) => s.account_status === "active" && s.student_id !== actorId)
    .map(({ student_id, university_id, first_name, middle_name, last_name, suffix, year_level }) => ({
      student_id,
      university_id,
      first_name,
      middle_name,
      last_name,
      suffix,
      year_level,
    }));
}

export default async function FacultyExternalCiRecordsPage({
  searchParams,
}: {
  searchParams: Promise<{
    semester?: string | string[];
    merit?: string | string[];
    demerit?: string | string[];
    tab?: string | string[];
  }>;
}) {
  await connection();
  const { semester, merit, demerit, tab } = await searchParams;
  const access = await getAccessContext();

  if (
    access.status !== "ready" ||
    !access.workspaces.includes("faculty") ||
    !access.roles.includes("RLE Coordinator") ||
    !access.roles.includes("Clinical Instructor")
  ) {
    return (
      <WorkspaceShell
        workspace="faculty"
        destination="external-ci-records"
        semester={semester}
      />
    );
  }

  const filter = semesterFilterSchema.safeParse({ semester });
  const selected = resolveSelectedSemester(access.semesters, semester) ?? undefined;
  const canAct = Boolean(selected?.is_current);
  const semesterLabel = selected
    ? `${selected.term} (AY ${selected.academic_year_start}–${selected.academic_year_start + 1})`
    : "";
  const renderedAt = new Date().toISOString();
  const tabValue = Array.isArray(tab) ? tab[0] : tab;
  const defaultTab: "merits" | "demerits" = tabValue === "demerits" ? "demerits" : "merits";

  // List views preserve an explicit semester; entry forms always target the current semester.
  const demeritListHref =
    filter.success && filter.data.semester
      ? `${path}?semester=${filter.data.semester}&tab=demerits`
      : `${path}?tab=demerits`;
  const meritListHref =
    filter.success && filter.data.semester
      ? `${path}?semester=${filter.data.semester}`
      : path;

  let content: React.ReactNode = null;
  const loadError = (
    <Card role="alert" className="flex flex-col items-center justify-center gap-4 p-8 text-center">
      <AlertCircle className="size-8 text-destructive" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">
        Unable to load external CI records. Refresh the page to try again.
      </p>
    </Card>
  );

  // WorkspaceShell 404s unknown semesters and explains when none exist.
  if (selected && canAct && demerit !== undefined) {
    const [roster, misconductOptions] = await Promise.all([
      getRoster(selected.id, "faculty").catch(() => null),
      getActiveMisconductCatalog().catch(() => null),
    ]);

    if (!roster || !misconductOptions) {
      content = loadError;
    } else {
      content = (
        <RecordExternalCiDemeritsFlow
          students={toActiveRecipients(roster, access.profile.id)}
          misconductOptions={misconductOptions}
          semesterLabel={semesterLabel}
          startsOn={selected.starts_on}
          endsOn={selected.ends_on}
          listHref={demeritListHref}
        />
      );
    }
  } else if (selected && canAct && merit !== undefined) {
    const roster = await getRoster(selected.id, "faculty").catch(() => null);
    if (!roster) {
      content = loadError;
    } else {
      content = (
        <RecordExternalCiMeritsFlow
          students={toActiveRecipients(roster, access.profile.id)}
          semesterLabel={semesterLabel}
          startsOn={selected.starts_on}
          endsOn={selected.ends_on}
          listHref={meritListHref}
        />
      );
    }
  } else if (selected) {
    const [merits, demerits] = await Promise.all([
      getExternalCiMerits(selected.id).catch(() => null),
      getExternalCiDemerits(selected.id).catch(() => null),
    ]);

    content = !merits || !demerits ? loadError : (
      <div className="flex w-full flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          {canAct ? (
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`${path}?demerit`} />}
              className="gap-2 max-sm:w-full max-sm:min-h-11 pointer-coarse:min-h-11"
            >
              <FileWarning className="size-4" aria-hidden="true" /> Record external demerit
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled
              className="gap-2 max-sm:w-full max-sm:min-h-11 pointer-coarse:min-h-11"
            >
              <FileWarning className="size-4" aria-hidden="true" /> Record external demerit
            </Button>
          )}
          {canAct ? (
            <Button
              nativeButton={false}
              render={<Link href={`${path}?merit`} />}
              className="gap-2 max-sm:w-full max-sm:min-h-11 pointer-coarse:min-h-11"
            >
              <Plus className="size-4" aria-hidden="true" /> Record external merit
            </Button>
          ) : (
            <Button
              disabled
              className="gap-2 max-sm:w-full max-sm:min-h-11 pointer-coarse:min-h-11"
            >
              <Plus className="size-4" aria-hidden="true" /> Record external merit
            </Button>
          )}
        </div>
        {!canAct && (
          <p className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            <Info className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <span>
              You are viewing {semesterLabel}. Recording new external CI merits and demerits
              requires the current semester, while waiving eligible past-semester external CI
              demerits remains allowed.
            </span>
          </p>
        )}
        <ExternalCiRecordsView
          merits={merits}
          demerits={demerits}
          defaultTab={defaultTab}
          semesterLabel={semesterLabel}
          isCurrentSemester={canAct}
          renderedAt={renderedAt}
        />
      </div>
    );
  }

  return (
    <WorkspaceShell workspace="faculty" destination="external-ci-records" semester={semester}>
      {content}
    </WorkspaceShell>
  );
}
