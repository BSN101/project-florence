"use client";

import { useState } from "react";
import Link from "next/link";
import { Award, Clock, FileWarning } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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

  const hasOutstandingDebt = summary.office.balance > 0 || summary.rle.balance > 0;
  const isEligible = canAct && availableMeritCount > 0 && hasOutstandingDebt;

  const ineligibilityReason = !canAct
    ? "Merits cannot be applied in a past semester."
    : availableMeritCount === 0
    ? "No available merits to apply."
    : !hasOutstandingDebt
    ? "No outstanding sanctions to offset."
    : undefined;

  const separator = applyBaseHref.includes("?") ? "&" : "?";
  const applyHref = `${applyBaseHref}${separator}apply`;

  const applyOfficeHref =
    canAct && availableMeritCount > 0 && summary.office.balance > 0
      ? `${applyHref}&bucket=office`
      : undefined;

  const applyRleHref =
    canAct && availableMeritCount > 0 && summary.rle.balance > 0
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
              className="shrink-0 gap-2 text-xs"
            >
              <FileWarning className="size-3.5" />
              <span>Demerits ({demerits.length})</span>
            </Button>

            <Button
              type="button"
              variant={activeTab === "merits" ? "default" : "ghost"}
              size="sm"
              onClick={() => handleTabChange("merits")}
              className="shrink-0 gap-2 text-xs"
            >
              <Award className="size-3.5" />
              <span>Merits ({merits.length})</span>
            </Button>

            <Button
              type="button"
              variant={activeTab === "services" ? "default" : "ghost"}
              size="sm"
              onClick={() => handleTabChange("services")}
              className="shrink-0 gap-2 text-xs"
            >
              <Clock className="size-3.5" />
              <span className="sm:hidden">Services ({serviceCredits.length})</span>
              <span className="hidden sm:inline">Service Credits ({serviceCredits.length})</span>
            </Button>
          </div>

          <div className="shrink-0">
            {isEligible ? (
              <Link
                href={applyHref}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 text-xs max-sm:w-full")}
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
                className="gap-1.5 text-xs max-sm:w-full"
                title={ineligibilityReason}
              >
                <Award className="size-3.5" />
                Apply merits
              </Button>
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
