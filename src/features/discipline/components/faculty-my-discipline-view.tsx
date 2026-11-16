"use client";

import { useState } from "react";
import { Award, FileWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FacultyMeritGroup } from "../contracts";
import { FacultyMeritsTable } from "./faculty-merits-table";

export function FacultyMyDisciplineView({
  merits,
}: {
  merits: FacultyMeritGroup[];
}) {
  const [activeTab, setActiveTab] = useState<"merits" | "demerits">("merits");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <Button
          type="button"
          variant={activeTab === "merits" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("merits")}
          className="gap-2 text-xs"
        >
          <Award className="size-3.5" />
          <span>Awarded Merits ({merits.length})</span>
        </Button>

        <Button
          type="button"
          variant={activeTab === "demerits" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("demerits")}
          className="gap-2 text-xs"
        >
          <FileWarning className="size-3.5" />
          <span>Demerits</span>
        </Button>
      </div>

      <div>
        {activeTab === "merits" && <FacultyMeritsTable merits={merits} />}
        {activeTab === "demerits" && (
          // Same height as TableFrame so switching tabs does not resize the page.
          <div className="flex h-[26rem] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/80 p-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <FileWarning className="size-6 text-muted-foreground" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold text-foreground">Faculty Demerit Logging</p>
              <p className="max-w-md text-xs text-muted-foreground">
                Demerits you log, with misconduct catalog selection and whole-day units, will appear here.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
