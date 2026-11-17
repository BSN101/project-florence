"use client";

import { useState } from "react";
import { Award, FileWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FacultyDemeritGroup, FacultyMeritGroup } from "../contracts";
import { FacultyDemeritsTable } from "./faculty-demerits-table";
import { FacultyMeritsTable } from "./faculty-merits-table";

export function FacultyMyDisciplineView({
  merits,
  demerits,
  defaultTab = "merits",
}: {
  merits: FacultyMeritGroup[];
  demerits: FacultyDemeritGroup[];
  defaultTab?: "merits" | "demerits";
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
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <Button
          type="button"
          variant={activeTab === "merits" ? "default" : "ghost"}
          size="sm"
          onClick={() => handleTabChange("merits")}
          className="gap-2 text-xs"
        >
          <Award className="size-3.5" />
          <span>Awarded Merits ({merits.length})</span>
        </Button>

        <Button
          type="button"
          variant={activeTab === "demerits" ? "default" : "ghost"}
          size="sm"
          onClick={() => handleTabChange("demerits")}
          className="gap-2 text-xs"
        >
          <FileWarning className="size-3.5" />
          <span>Issued Demerits ({demerits.length})</span>
        </Button>
      </div>

      <div>
        {activeTab === "merits" && <FacultyMeritsTable merits={merits} />}
        {activeTab === "demerits" && <FacultyDemeritsTable demerits={demerits} />}
      </div>
    </div>
  );
}
