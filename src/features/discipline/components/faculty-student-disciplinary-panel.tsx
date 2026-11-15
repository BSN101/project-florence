"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Award, Clock, FileWarning, Loader2, ShieldCheck, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getStudentDisciplinaryLedgerAction } from "../actions";
import type { FacultyDisciplinaryViewData } from "../contracts";
import { DemeritsTable } from "./demerits-table";
import { DisciplinaryBalanceCards } from "./disciplinary-balance-cards";
import { MeritsTable } from "./merits-table";
import { ServiceCreditsTable } from "./service-credits-table";

export function FacultyStudentDisciplinaryPanel({
  studentId,
}: {
  studentId: string;
  semesterId?: string;
}) {
  const [data, setData] = useState<FacultyDisciplinaryViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"demerits" | "merits" | "services">("demerits");

  useEffect(() => {
    let cancelled = false;

    getStudentDisciplinaryLedgerAction(studentId)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message ?? "Unable to load disciplinary records");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground">Loading disciplinary records...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
        <AlertCircle className="size-4 shrink-0" />
        <span>{error ?? "Failed to load records"}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Coordinator View */}
      {data.isCoordinator && data.summary && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-xs font-medium text-primary">
            <ShieldCheck className="size-4" />
            <span>Coordinator View · Cumulative Student Disciplinary Balances</span>
          </div>
          <DisciplinaryBalanceCards summary={data.summary} />
        </div>
      )}

      {/* Ordinary Instructor Scoped View Note */}
      {!data.isCoordinator && (
        <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
          <User className="size-4 text-primary mt-0.5 shrink-0" />
          <div>
            <strong className="text-foreground">Instructor-Scoped Activity (FL-029):</strong>
            <p className="mt-0.5 text-[11px]">
              Showing only demerits, merit awards, and service credits personally issued by you for this student.
              Institutional policy restricts whole-ledger balances and cross-instructor history to Academic and RLE Coordinators.
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 border-b border-border pb-1.5">
          <Button
            type="button"
            variant={activeTab === "demerits" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("demerits")}
            className="h-7 gap-1.5 px-2.5 text-xs"
          >
            <FileWarning className="size-3.5" />
            <span>Demerits ({data.demerits.length})</span>
          </Button>

          <Button
            type="button"
            variant={activeTab === "merits" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("merits")}
            className="h-7 gap-1.5 px-2.5 text-xs"
          >
            <Award className="size-3.5" />
            <span>Merits ({data.merits.length})</span>
          </Button>

          <Button
            type="button"
            variant={activeTab === "services" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("services")}
            className="h-7 gap-1.5 px-2.5 text-xs"
          >
            <Clock className="size-3.5" />
            <span>Services ({data.serviceCredits.length})</span>
          </Button>
        </div>

        <div>
          {activeTab === "demerits" && <DemeritsTable demerits={data.demerits} />}
          {activeTab === "merits" && <MeritsTable merits={data.merits} />}
          {activeTab === "services" && <ServiceCreditsTable credits={data.serviceCredits} />}
        </div>
      </div>
    </div>
  );
}
