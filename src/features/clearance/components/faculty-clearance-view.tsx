"use client";

import { useMemo } from "react";
import { AlertCircle, CheckCircle2, Clock, ShieldCheck, Users } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { FacultyClearanceCandidate, FacultyClearanceComponent } from "../contracts";
import { FacultyCandidateTable } from "./faculty-candidate-table";

export function FacultyClearanceView({
  candidates,
  semesterId,
  component,
  isCurrentSemester,
}: {
  candidates: FacultyClearanceCandidate[];
  semesterId: string;
  component: FacultyClearanceComponent;
  isCurrentSemester: boolean;
}) {
  const componentLabel = component === "academic" ? "Academic" : "RLE";
  const bucketLabel = component === "academic" ? "Office" : "RLE";

  const stats = useMemo(() => {
    let cleared = 0;
    let councilCleared = 0;
    let withDebt = 0;

    for (const c of candidates) {
      if (c.status.cleared) cleared++;
      if (c.councilCleared) councilCleared++;
      if (c.netBalance > 0) withDebt++;
    }
    const total = candidates.length;
    const pending = total - cleared;

    return { total, cleared, councilCleared, pending, withDebt };
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
      title: "Council Cleared",
      value: stats.councilCleared,
      description: "Prerequisite confirmed",
      icon: ShieldCheck,
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-600 dark:text-blue-400",
      valueColor: "text-blue-600 dark:text-blue-400",
    },
    {
      title: `${componentLabel} Cleared`,
      value: stats.cleared,
      description: `Confirmed ${componentLabel} clearance`,
      icon: CheckCircle2,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-600 dark:text-emerald-400",
      valueColor: "text-emerald-600 dark:text-emerald-400",
    },
    {
      title: "Pending Clearance",
      value: stats.pending,
      description: "Awaiting coordinator action",
      icon: Clock,
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-600 dark:text-amber-400",
      valueColor: "text-amber-600 dark:text-amber-400",
    },
    {
      title: `With ${bucketLabel} Debt`,
      value: stats.withDebt,
      description: `Unserved ${bucketLabel} demerits`,
      icon: AlertCircle,
      iconBg: "bg-destructive/10",
      iconColor: "text-destructive",
      valueColor: "text-foreground",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">
          Council clearance is a prerequisite for {componentLabel} clearance. Disciplinary balances remain visible
          for review but do not automatically block confirmation.
        </p>
        {!isCurrentSemester && (
          <div className="mt-1 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            <AlertCircle className="size-4 shrink-0" />
            <span>
              You are viewing a historical semester. Clearance confirmations are permitted only during the active current semester.
            </span>
          </div>
        )}
      </div>

      {/* Summary Stat Cards - 1 big card + 2x2 grid on mobile/tablet (< lg), 5 cols on desktop (>= lg) */}
      <div className="grid grid-cols-2 gap-3 sm:gap-3.5 lg:grid-cols-5 xl:gap-4 min-w-0 max-w-full">
        {statCards.map((card, index) => (
          <Card
            key={card.title}
            className={cn(
              "flex flex-col justify-between rounded-xl border border-border bg-card p-3 sm:p-3.5 xl:p-4 shadow-xs min-w-0 w-full",
              index === 0 && "col-span-2 lg:col-span-1"
            )}
          >
            <div className="flex items-center justify-between gap-1.5 pb-2 min-w-0">
              <span className="text-xs font-medium text-muted-foreground leading-tight min-w-0 break-words">
                {card.title}
              </span>
              <div
                className={`flex size-7.5 shrink-0 items-center justify-center rounded-lg sm:size-8 ${card.iconBg} ${card.iconColor}`}
              >
                <card.icon className="size-3.5 sm:size-4" />
              </div>
            </div>
            <div className="min-w-0">
              <div
                className={`font-heading text-2xl font-bold tracking-tight tabular-nums ${card.valueColor}`}
              >
                {card.value}
              </div>
              <div className="mt-1 min-h-[2rem] flex items-start">
                <p className="text-[11px] text-muted-foreground leading-snug break-words">
                  {card.description}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Main Table */}
      <FacultyCandidateTable
        candidates={candidates}
        semesterId={semesterId}
        component={component}
        isCurrentSemester={isCurrentSemester}
      />
    </div>
  );
}
