"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Award, FileWarning } from "lucide-react";

import { RefreshButton } from "@/components/layout/refresh-button";
import { Button } from "@/components/ui/button";

import type { ExternalCiDemeritUnitRecord, ExternalCiMeritGroupRecord } from "../contracts";
import { ExternalCiDemeritsTable } from "./external-ci-demerits-table";
import { ExternalCiMeritsTable } from "./external-ci-merits-table";

export function ExternalCiRecordsView({
  merits,
  demerits,
  defaultTab = "merits",
  semesterLabel,
  isCurrentSemester,
  renderedAt,
}: {
  merits: ExternalCiMeritGroupRecord[];
  demerits: ExternalCiDemeritUnitRecord[];
  defaultTab?: "merits" | "demerits";
  semesterLabel: string;
  isCurrentSemester: boolean;
  renderedAt: string;
}) {
  const pathname = usePathname();
  const syncKey = `${pathname}:${semesterLabel}:${defaultTab}`;
  const [seenKey, setSeenKey] = useState(syncKey);
  const [activeTab, setActiveTab] = useState<"merits" | "demerits">(defaultTab);

  // Preserved routes stay mounted under <Activity>: sync tab when route, semester, or defaultTab changes.
  if (seenKey !== syncKey) {
    setSeenKey(syncKey);
    if (activeTab !== defaultTab) {
      setActiveTab(defaultTab);
    }
  }

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
            aria-pressed={activeTab === "merits"}
            onClick={() => handleTabChange("merits")}
            className="gap-2 text-xs max-sm:min-h-11 pointer-coarse:min-h-11"
          >
            <Award className="size-4" aria-hidden="true" />
            <span className="tabular-nums">External Merits ({merits.length})</span>
          </Button>

          <Button
            type="button"
            variant={activeTab === "demerits" ? "default" : "ghost"}
            size="sm"
            aria-pressed={activeTab === "demerits"}
            onClick={() => handleTabChange("demerits")}
            className="gap-2 text-xs max-sm:min-h-11 pointer-coarse:min-h-11"
          >
            <FileWarning className="size-4" aria-hidden="true" />
            <span className="tabular-nums">External Demerits ({demerits.length})</span>
          </Button>
        </div>

        <RefreshButton renderedAt={renderedAt} />
      </div>

      <div className="w-full">
        {activeTab === "merits" && (
          <ExternalCiMeritsTable merits={merits} semesterLabel={semesterLabel} />
        )}
        {activeTab === "demerits" && (
          <ExternalCiDemeritsTable
            demerits={demerits}
            semesterLabel={semesterLabel}
            isCurrentSemester={isCurrentSemester}
          />
        )}
      </div>
    </div>
  );
}
