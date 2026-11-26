"use client";

import Link from "next/link";
import { useState } from "react";
import { Award, FileWarning } from "lucide-react";

import { RefreshButton } from "@/components/layout/refresh-button";
import { Button } from "@/components/ui/button";

import type { CouncilDisciplinaryViewData } from "../contracts";
import { CouncilDemeritsTable } from "./council-demerits-table";
import { CouncilEndorsementsTable } from "./council-endorsements-table";

export function CouncilDisciplinaryView({
  data,
  defaultTab = "demerits",
  canAct = true,
  endorseHref = "/council/merit-endorsements-and-council-demerits?endorse",
  semesterLabel,
  isCurrentSemester,
  renderedAt,
}: {
  data: CouncilDisciplinaryViewData;
  defaultTab?: "demerits" | "endorsements";
  canAct?: boolean;
  endorseHref?: string;
  semesterLabel: string;
  isCurrentSemester: boolean;
  renderedAt: string;
}) {
  const [activeTab, setActiveTab] = useState<"demerits" | "endorsements">(defaultTab);

  function handleTabChange(nextTab: "demerits" | "endorsements") {
    setActiveTab(nextTab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (nextTab === "endorsements") {
        url.searchParams.set("tab", "endorsements");
      } else {
        url.searchParams.delete("tab");
      }
      window.history.replaceState(null, "", url.toString());
    }
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-2 border-b border-border pb-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={activeTab === "demerits" ? "default" : "ghost"}
            size="sm"
            onClick={() => handleTabChange("demerits")}
            className="gap-2 text-xs max-sm:min-h-11 pointer-coarse:min-h-11"
          >
            <FileWarning className="size-4" aria-hidden="true" />
            <span>Council Demerits ({data.demerits.length})</span>
          </Button>

          <Button
            type="button"
            variant={activeTab === "endorsements" ? "default" : "ghost"}
            size="sm"
            onClick={() => handleTabChange("endorsements")}
            className="gap-2 text-xs max-sm:min-h-11 pointer-coarse:min-h-11"
          >
            <Award className="size-4" aria-hidden="true" />
            <span>Merit Endorsements ({data.endorsements.length})</span>
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton renderedAt={renderedAt} />
          {canAct ? (
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={endorseHref} />}
              className="gap-2 text-xs max-sm:w-full max-sm:min-h-11 pointer-coarse:min-h-11"
            >
              <Award className="size-4" aria-hidden="true" /> Endorse for merit
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled
              className="gap-2 text-xs max-sm:w-full max-sm:min-h-11 pointer-coarse:min-h-11"
              title="Merit endorsements can only be submitted for the active semester."
            >
              <Award className="size-4" aria-hidden="true" /> Endorse for merit
            </Button>
          )}
        </div>
      </div>

      <div>
        {activeTab === "demerits" && (
          <CouncilDemeritsTable
            demerits={data.demerits}
            semesterLabel={semesterLabel}
            isCurrentSemester={isCurrentSemester}
          />
        )}
        {activeTab === "endorsements" && (
          <CouncilEndorsementsTable endorsements={data.endorsements} />
        )}
      </div>
    </div>
  );
}
