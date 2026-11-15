"use client";

import { useState } from "react";
import { Award, FileWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CouncilDisciplinaryViewData } from "../contracts";
import { CouncilDemeritsTable } from "./council-demerits-table";
import { CouncilEndorsementsTable } from "./council-endorsements-table";

export function CouncilDisciplinaryView({
  data,
}: {
  data: CouncilDisciplinaryViewData;
}) {
  const [activeTab, setActiveTab] = useState<"demerits" | "endorsements">("demerits");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <Button
          type="button"
          variant={activeTab === "demerits" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("demerits")}
          className="gap-2 text-xs"
        >
          <FileWarning className="size-3.5" />
          <span>Council Demerits ({data.demerits.length})</span>
        </Button>

        <Button
          type="button"
          variant={activeTab === "endorsements" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("endorsements")}
          className="gap-2 text-xs"
        >
          <Award className="size-3.5" />
          <span>Merit Endorsements ({data.endorsements.length})</span>
        </Button>
      </div>

      <div>
        {activeTab === "demerits" && <CouncilDemeritsTable demerits={data.demerits} />}
        {activeTab === "endorsements" && (
          <CouncilEndorsementsTable endorsements={data.endorsements} />
        )}
      </div>
    </div>
  );
}
