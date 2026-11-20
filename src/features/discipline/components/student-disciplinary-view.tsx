"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Award, Clock, FileWarning } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { canApplyMerits } from "../calculations";
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
  canAct = false,
  availableMeritCount = 0,
  defaultTab = "demerits",
  applyBaseHref = "/student/merits-demerits-and-services",
}: {
  summary: StudentDisciplinarySummary;
  demerits: DemeritRecord[];
  merits: MeritRecord[];
  serviceCredits: ServiceCreditRecord[];
  canAct?: boolean;
  availableMeritCount?: number;
  defaultTab?: "demerits" | "merits" | "services";
  applyBaseHref?: string;
}) {
  const [prevDefaultTab, setPrevDefaultTab] = useState(defaultTab);
  const [activeTab, setActiveTab] = useState<"demerits" | "merits" | "services">(defaultTab);

  if (prevDefaultTab !== defaultTab) {
    setPrevDefaultTab(defaultTab);
    setActiveTab(defaultTab);
  }

  const handleTabChange = (tab: "demerits" | "merits" | "services") => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (tab === "demerits") {
        url.searchParams.delete("tab");
      } else {
        url.searchParams.set("tab", tab);
      }
      window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    }
  };

  const isEligible = canApplyMerits(summary, availableMeritCount, canAct);

  const reasonId = useId();
  const ineligibilityReason = !canAct
    ? "Merits cannot be applied in a past semester."
    : availableMeritCount === 0
    ? "No available merits to apply."
    : !summary.hasOutstandingDebt
    ? "No outstanding sanctions to offset."
    : undefined;

  const separator = applyBaseHref.includes("?") ? "&" : "?";
  const applyHref = `${applyBaseHref}${separator}apply`;

  const applyOfficeHref =
    canApplyMerits(summary, availableMeritCount, canAct, "office")
      ? `${applyHref}&bucket=office`
      : undefined;

  const applyRleHref =
    canApplyMerits(summary, availableMeritCount, canAct, "rle")
      ? `${applyHref}&bucket=rle`
      : undefined;

  return (
    <div className="flex flex-col gap-6">
      {/* Authoritative Balance Cards */}
      <DisciplinaryBalanceCards
        summary={summary}
        applyOfficeHref={applyOfficeHref}
        applyRleHref={applyRleHref}
      />

      {/* Tabs navigation and actions */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-2">
          <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Button
              type="button"
              variant={activeTab === "demerits" ? "default" : "ghost"}
              size="sm"
              onClick={() => handleTabChange("demerits")}
              className="shrink-0 gap-2 text-xs max-sm:min-h-11"
            >
              <FileWarning className="size-3.5" />
              <span>Demerits ({demerits.length})</span>
            </Button>

            <Button
              type="button"
              variant={activeTab === "merits" ? "default" : "ghost"}
              size="sm"
              onClick={() => handleTabChange("merits")}
              className="shrink-0 gap-2 text-xs max-sm:min-h-11"
            >
              <Award className="size-3.5" />
              <span>Merits ({merits.length})</span>
            </Button>

            <Button
              type="button"
              variant={activeTab === "services" ? "default" : "ghost"}
              size="sm"
              onClick={() => handleTabChange("services")}
              className="shrink-0 gap-2 text-xs max-sm:min-h-11"
            >
              <Clock className="size-3.5" />
              <span className="sm:hidden">Services ({serviceCredits.length})</span>
              <span className="hidden sm:inline">Service Credits ({serviceCredits.length})</span>
            </Button>
          </div>

          <div className="flex shrink-0 flex-col gap-1 max-sm:w-full sm:items-end">
            {isEligible ? (
              <Link
                href={applyHref}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 text-xs max-sm:min-h-11 max-sm:w-full")}
              >
                <Award className="size-3.5" />
                Apply merits
              </Link>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled
                className="gap-1.5 text-xs max-sm:min-h-11 max-sm:w-full"
                aria-describedby={reasonId}
              >
                <Award className="size-3.5" />
                Apply merits
              </Button>
            )}
            {!isEligible && ineligibilityReason && (
              <p id={reasonId} className="text-xs text-muted-foreground">
                {ineligibilityReason}
              </p>
            )}
          </div>
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
