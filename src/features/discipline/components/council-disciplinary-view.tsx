"use client";

import Link from "next/link";
import { useState } from "react";
import { Award, FileWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CouncilDisciplinaryViewData } from "../contracts";
import { CouncilDemeritsTable } from "./council-demerits-table";
import { CouncilEndorsementsTable } from "./council-endorsements-table";

export function CouncilDisciplinaryView({
  data,
  defaultTab = "demerits",
  canAct = true,
  endorseHref = "/council/merit-endorsements-and-council-demerits?endorse",
}: {
  data: CouncilDisciplinaryViewData;
  defaultTab?: "demerits" | "endorsements";
  canAct?: boolean;
  endorseHref?: string;
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={activeTab === "demerits" ? "default" : "ghost"}
            size="sm"
            onClick={() => handleTabChange("demerits")}
            className="gap-2 text-xs"
          >
            <FileWarning className="size-3.5" />
            <span>Council Demerits ({data.demerits.length})</span>
          </Button>

          <Button
            type="button"
            variant={activeTab === "endorsements" ? "default" : "ghost"}
            size="sm"
            onClick={() => handleTabChange("endorsements")}
            className="gap-2 text-xs"
          >
            <Award className="size-3.5" />
            <span>Merit Endorsements ({data.endorsements.length})</span>
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {canAct ? (
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={endorseHref} />}
              className="gap-1.5 text-xs max-sm:w-full"
            >
              <Award className="size-3.5" /> Endorse for merit
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled
              className="gap-1.5 text-xs max-sm:w-full"
              title="Merit endorsements can only be submitted for the active semester."
            >
              <Award className="size-3.5" /> Endorse for merit
            </Button>
          )}
        </div>
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
