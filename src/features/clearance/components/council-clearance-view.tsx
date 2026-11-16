"use client";

import { useMemo } from "react";
import { AlertCircle, CheckCircle2, Clock, Users } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { CouncilClearanceCandidate } from "../contracts";
import { CandidateTable } from "./candidate-table";

export function CouncilClearanceView({
  candidates,
  semesterId,
}: {
  candidates: CouncilClearanceCandidate[];
  semesterId: string;
}) {
  const stats = useMemo(() => {
    let cleared = 0;
    let withDebtOrDemerits = 0;
    for (const c of candidates) {
      if (c.status.cleared) cleared++;
      if (c.totalOutstandingPayable > 0 || c.activeCouncilDemerits > 0) withDebtOrDemerits++;
    }
    const total = candidates.length;
    const pending = total - cleared;

    return { total, cleared, pending, withDebtOrDemerits };
  }, [candidates]);

  const statCards = [
    {
      title: "Enrolled Students",
      value: stats.total,
      description: "Active semester roster",
      icon: Users,
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
      valueColor: "text-foreground",
    },
    {
      title: "Cleared",
      value: stats.cleared,
      description: "Confirmed Council clearance",
      icon: CheckCircle2,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-600 dark:text-emerald-400",
      valueColor: "text-emerald-600 dark:text-emerald-400",
    },
    {
      title: "Pending Clearance",
      value: stats.pending,
      description: "Awaiting officer confirmation",
      icon: Clock,
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-600 dark:text-amber-400",
      valueColor: "text-amber-600 dark:text-amber-400",
    },
    {
      title: "With Obligations",
      value: stats.withDebtOrDemerits,
      description: "Active dues or demerits",
      icon: AlertCircle,
      iconBg: "bg-destructive/10",
      iconColor: "text-destructive",
      valueColor: "text-foreground",
    },
  ];

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Outstanding balances and demerits don&apos;t block clearance, and clearing a student doesn&apos;t
        change them.
      </p>

      {/* Summary Stat Cards - 1 col mobile, 2 cols tablet (iPad mini), 4 cols desktop */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
        {statCards.map((card) => (
          <Card
            key={card.title}
            className="flex flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-xs"
          >
            <div className="flex items-center justify-between gap-2 pb-2">
              <span className="text-xs font-medium text-muted-foreground truncate">
                {card.title}
              </span>
              <div
                className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${card.iconBg} ${card.iconColor}`}
              >
                <card.icon className="size-4" />
              </div>
            </div>
            <div>
              <div
                className={`font-heading text-2xl font-bold tracking-tight tabular-nums ${card.valueColor}`}
              >
                {card.value}
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
                {card.description}
              </p>
            </div>
          </Card>
        ))}
      </div>

      {/* Main Table */}
      <CandidateTable candidates={candidates} semesterId={semesterId} />
    </div>
  );
}
