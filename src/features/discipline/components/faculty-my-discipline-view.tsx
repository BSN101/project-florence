"use client";

import { useState } from "react";
import { Award, FileWarning } from "lucide-react";

import { RefreshButton } from "@/components/layout/refresh-button";
import { Button } from "@/components/ui/button";

import type { FacultyDemeritUnitRecord, FacultyMeritGroup } from "../contracts";
import { FacultyDemeritsTable } from "./faculty-demerits-table";
import { FacultyMeritsTable } from "./faculty-merits-table";

export function FacultyMyDisciplineView({
  merits,
  demerits,
  defaultTab = "merits",
  semesterLabel,
  isCurrentSemester,
  renderedAt,
}: {
  merits: FacultyMeritGroup[];
  demerits: FacultyDemeritUnitRecord[];
  defaultTab?: "merits" | "demerits";
  semesterLabel: string;
  isCurrentSemester: boolean;
  renderedAt: string;
}) {
  const [activeTab, setActiveTab] = useState<"merits" | "demerits">(defaultTab);

  function handleTabChange(nextTab: "merits" | "demerits") {
    setActiveTab(nextTab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (nextTab === "demerits") {
        url.searchParams.set("tab", "demerits");
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
            variant={activeTab === "merits" ? "default" : "ghost"}
            size="sm"
            onClick={() => handleTabChange("merits")}
            className="gap-2 text-xs max-sm:min-h-11 pointer-coarse:min-h-11"
          >
            <Award className="size-4" aria-hidden="true" />
            <span>Awarded Merits ({merits.length})</span>
          </Button>

          <Button
            type="button"
            variant={activeTab === "demerits" ? "default" : "ghost"}
            size="sm"
            onClick={() => handleTabChange("demerits")}
            className="gap-2 text-xs max-sm:min-h-11 pointer-coarse:min-h-11"
          >
            <FileWarning className="size-4" aria-hidden="true" />
            <span>Issued Demerits ({demerits.length})</span>
          </Button>
        </div>

        <RefreshButton renderedAt={renderedAt} />
      </div>

      <div>
        {activeTab === "merits" && <FacultyMeritsTable merits={merits} />}
        {activeTab === "demerits" && (
          <FacultyDemeritsTable
            demerits={demerits}
            semesterLabel={semesterLabel}
            isCurrentSemester={isCurrentSemester}
          />
        )}
      </div>
    </div>
  );
}
