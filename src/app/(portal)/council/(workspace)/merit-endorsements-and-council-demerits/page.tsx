import { connection } from "next/server";
import { notFound } from "next/navigation";
import { AlertCircle } from "lucide-react";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { Card } from "@/components/ui/card";
import { CouncilDisciplinaryView } from "@/features/discipline/components/council-disciplinary-view";
import { SubmitEndorsementsFlow } from "@/features/discipline/components/submit-endorsements-flow";
import type {
  CouncilDisciplinaryViewData,
  MeritEndorsementRecipientOption,
} from "@/features/discipline/contracts";
import {
  getCouncilDisciplinaryRecords,
  getInstructorChoices,
} from "@/features/discipline/queries";
import { resolveSelectedSemester } from "@/features/semesters/schemas";
import { getRoster } from "@/features/students/queries";
import { getAccessContext } from "@/server/auth/access-context";

export const instant = false;

export default async function CouncilMeritEndorsementsAndDemeritsPage({
  searchParams,
}: {
  searchParams: Promise<{
    semester?: string | string[];
    tab?: string | string[];
    endorse?: string | string[];
    student?: string | string[];
  }>;
}) {
  await connection();
  const resolvedSearchParams = await searchParams;
  const { semester, tab, endorse, student } = resolvedSearchParams;
  const access = await getAccessContext();

  if (access.status !== "ready" || !access.workspaces.includes("council")) {
    return (
      <WorkspaceShell
        workspace="council"
        destination="merit-endorsements-and-council-demerits"
        semester={semester}
      />
    );
  }

  // FL-029 & Navigation Map: Only Council Executive and Operations manage/view endorsements and demerits.
  // Representatives have events-only access and are strictly denied.
  const canManage =
    access.councilRole === "executive" || access.councilRole === "operations";
  if (!canManage) {
    notFound();
  }

  const selected = resolveSelectedSemester(access.semesters, semester) ?? undefined;
  const canAct = Boolean(selected?.is_current);
  const semesterLabel = selected
    ? `${selected.term} (AY ${selected.academic_year_start}–${selected.academic_year_start + 1})`
    : "";
  const renderedAt = new Date().toISOString();

  const path = "/council/merit-endorsements-and-council-demerits";
  const explicitSemester =
    selected && typeof semester === "string" && semester === selected.id ? semester : undefined;
  const baseHref = explicitSemester ? `${path}?semester=${explicitSemester}` : path;
  const endorseListHref = baseHref.includes("?")
    ? `${baseHref}&tab=endorsements`
    : `${baseHref}?tab=endorsements`;
  const endorseHref = baseHref.includes("?")
    ? `${baseHref}&endorse`
    : `${baseHref}?endorse`;

  const defaultTab = tab === "endorsements" ? "endorsements" : "demerits";
  const isEndorsing = endorse !== undefined;
  const initialStudentId = typeof student === "string" ? student : undefined;

  let content: React.ReactNode = null;
  const loadError = (
    <Card role="alert" className="flex flex-col items-center justify-center gap-3 p-8 text-center">
      <AlertCircle className="size-8 text-destructive" />
      <p className="text-xs text-muted-foreground">
        Unable to load Council disciplinary records. Refresh the page to try again.
      </p>
    </Card>
  );

  if (selected && isEndorsing && canAct) {
    const [roster, instructors] = await Promise.all([
      getRoster(selected.id, "council").catch(() => null),
      getInstructorChoices().catch(() => null),
    ]);

    if (!roster || !instructors) {
      content = loadError;
    } else {
      const candidateStudents: MeritEndorsementRecipientOption[] = roster
        .filter((s) => s.student_id !== access.profile.id && s.account_status !== "archived")
        .map(({ student_id, university_id, first_name, middle_name, last_name, suffix, year_level }) => ({
          student_id,
          university_id,
          first_name,
          middle_name,
          last_name,
          suffix,
          year_level,
        }));

      content = (
        <SubmitEndorsementsFlow
          students={candidateStudents}
          instructors={instructors}
          currentProfileId={access.profile.id}
          initialStudentId={initialStudentId}
          listHref={endorseListHref}
        />
      );
    }
  } else if (selected) {
    let data: CouncilDisciplinaryViewData | null = null;
    try {
      data = await getCouncilDisciplinaryRecords(selected.id);
    } catch {
      data = null;
    }

    if (!data) {
      content = loadError;
    } else {
      content = (
        <CouncilDisciplinaryView
          data={data}
          defaultTab={defaultTab}
          canAct={canAct}
          endorseHref={endorseHref}
          semesterLabel={semesterLabel}
          isCurrentSemester={canAct}
          renderedAt={renderedAt}
        />
      );
    }
  }

  return (
    <WorkspaceShell
      workspace="council"
      destination="merit-endorsements-and-council-demerits"
      semester={semester}
    >
      {content}
    </WorkspaceShell>
  );
}
