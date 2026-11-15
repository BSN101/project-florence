"use client";

import { useState } from "react";
import { Award, Clock, FileWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  DemeritRecord,
  MeritRecord,
  ServiceCreditRecord,
  StudentDisciplinarySummary,
} from "../contracts";
import { DemeritsTable } from "./demerits-table";
import { DisciplinaryBalanceCards } from "./disciplinary-balance-cards";
import { MeritsTable } from "./merits-table";
import { ServiceCreditsTable } from "./service-credits-table";

export function StudentDisciplinaryView({
  summary,
  demerits,
  merits,
  serviceCredits,
}: {
  summary: StudentDisciplinarySummary;
  demerits: DemeritRecord[];
  merits: MeritRecord[];
  serviceCredits: ServiceCreditRecord[];
}) {
  const [activeTab, setActiveTab] = useState<"demerits" | "merits" | "services">("demerits");

  return (
    <div className="flex flex-col gap-6">
      {/* Authoritative Balance Cards */}
      <DisciplinaryBalanceCards summary={summary} />

      {/* Tabs navigation */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 border-b border-border pb-2">
          <Button
            type="button"
            variant={activeTab === "demerits" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("demerits")}
            className="gap-2 text-xs"
          >
            <FileWarning className="size-3.5" />
            <span>Demerits ({demerits.length})</span>
          </Button>

          <Button
            type="button"
            variant={activeTab === "merits" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("merits")}
            className="gap-2 text-xs"
          >
            <Award className="size-3.5" />
            <span>Merits ({merits.length})</span>
          </Button>

          <Button
            type="button"
            variant={activeTab === "services" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("services")}
            className="gap-2 text-xs"
          >
            <Clock className="size-3.5" />
            <span>Service Credits ({serviceCredits.length})</span>
          </Button>
        </div>

        {/* Tab content */}
        <div>
          {activeTab === "demerits" && <DemeritsTable demerits={demerits} />}
          {activeTab === "merits" && <MeritsTable merits={merits} />}
          {activeTab === "services" && <ServiceCreditsTable credits={serviceCredits} />}
        </div>
      </div>
    </div>
  );
}
