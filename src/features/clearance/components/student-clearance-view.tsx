import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  GraduationCap,
  History,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { StudentClearanceComponentStatus, StudentClearanceSummary } from "../contracts";

const confirmedDateFormat = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

type CardConfig = {
  key: "council" | "academic" | "rle";
  title: string;
  icon: LucideIcon;
  iconClass: string;
  metClass: string;
  covers: string;
  href: string;
  linkLabel: string;
};

// Wording follows FL-040/FL-041: balances are reviewed by the confirmer but never block clearance.
const cards: CardConfig[] = [
  {
    key: "council",
    title: "Council",
    icon: Building2,
    iconClass: "bg-primary/10 text-primary",
    metClass: "",
    covers:
      "Confirmed by a Council officer. Council clearance must be granted before faculty coordinators can sign off.",
    href: "/student/fees-and-fines",
    linkLabel: "Review Fees & Fines",
  },
  {
    key: "academic",
    title: "Academic",
    icon: GraduationCap,
    iconClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    metClass: "border-blue-500/20 bg-blue-500/10 text-blue-800 dark:text-blue-300",
    covers: "Confirmed by the Academic Coordinator, who reviews your Office disciplinary records.",
    href: "/student/merits-demerits-and-services",
    linkLabel: "Review Disciplinary Records",
  },
  {
    key: "rle",
    title: "RLE",
    icon: Stethoscope,
    iconClass: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
    metClass: "border-teal-500/20 bg-teal-500/10 text-teal-800 dark:text-teal-300",
    covers: "Confirmed by the RLE Coordinator, who reviews your RLE disciplinary records and service credits.",
    href: "/student/merits-demerits-and-services",
    linkLabel: "Review Disciplinary Records",
  },
];

function ClearanceStatusIndicator({ status }: { status: StudentClearanceComponentStatus }) {
  if (status.cleared) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
        <Check className="size-3.5 shrink-0 stroke-[2.5]" aria-hidden="true" />
        Cleared
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground whitespace-nowrap">
      <span className="size-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
      Pending
    </span>
  );
}

function ClearanceCard({
  config,
  status,
  councilCleared,
}: {
  config: CardConfig;
  status: StudentClearanceComponentStatus;
  councilCleared: boolean;
}) {
  const Icon = config.icon;
  const isCouncil = config.key === "council";

  return (
    <Card className="flex flex-col justify-between border-border bg-card">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", config.iconClass)}>
              <Icon className="size-3.5" />
            </div>
            <CardTitle className="text-sm font-semibold truncate">{config.title}</CardTitle>
          </div>
          {isCouncil && (
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              Prerequisite
            </span>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Status</span>
          <ClearanceStatusIndicator status={status} />
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 py-4 text-xs">
        {status.cleared ? (
          <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/15 p-3 text-muted-foreground">
            <div className="text-foreground font-medium">{config.title} clearance confirmed</div>
            {status.confirmedAt && (
              <div className="mt-1 text-[11px]">
                Confirmed on {confirmedDateFormat.format(new Date(status.confirmedAt))}
              </div>
            )}
            {status.confirmedByName && <div className="mt-0.5 text-[11px]">by {status.confirmedByName}</div>}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {!isCouncil &&
              (councilCleared ? (
                <div className={cn("rounded-md border p-3 text-[11px]", config.metClass)}>
                  <span className="font-medium">Prerequisite Met:</span> Council clearance is confirmed. Awaiting
                  review and confirmation by the {config.title} Coordinator.
                </div>
              ) : (
                <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-[11px] text-amber-800 dark:text-amber-300">
                  <span className="font-medium">Council Clearance Required:</span> Council sign-off is a prerequisite
                  before your {config.title} Coordinator can confirm clearance.
                </div>
              ))}
            <p className="text-muted-foreground leading-relaxed">{config.covers}</p>
            <div className="rounded-md bg-muted/50 p-3 text-[11px] text-muted-foreground">
              Outstanding balances are shown to the reviewer but do not automatically block clearance.
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-2 border-t border-border/40">
        {status.cleared ? (
          <div className="flex w-full items-center justify-center py-2 text-xs text-muted-foreground">
            <Check className="mr-1.5 size-3.5 text-emerald-600" />
            Confirmed
          </div>
        ) : (
          <Link
            href={config.href}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "w-full justify-between min-h-[44px] text-xs font-medium"
            )}
          >
            <span>{config.linkLabel}</span>
            <ArrowRight className="size-3.5 shrink-0 ml-1.5" />
          </Link>
        )}
      </CardFooter>
    </Card>
  );
}

export function StudentClearanceView({ summary }: { summary: StudentClearanceSummary }) {
  const { components, isFullyCleared, semesterName } = summary;
  const clearedCount = cards.filter((c) => components[c.key].cleared).length;
  const pendingFaculty = cards.filter((c) => c.key !== "council" && !components[c.key].cleared);

  return (
    <div className="flex flex-col gap-6 overflow-x-hidden">
      {isFullyCleared ? (
        <div className="flex items-start gap-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 sm:p-5 text-emerald-950 dark:text-emerald-100 shadow-xs">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="section-title text-emerald-900 dark:text-emerald-200">Semester Clearance Complete</h2>
            <p className="mt-1 text-xs text-emerald-800/90 dark:text-emerald-300/90">
              All three clearances (Council, Academic, and RLE) are officially confirmed for {semesterName}.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4 min-w-0 flex-1">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <span className="font-heading text-sm font-semibold">{clearedCount}/3</span>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="section-title text-foreground">{clearedCount} of 3 clearances confirmed</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {components.council.cleared
                  ? pendingFaculty.length === 1
                    ? `Council clearance is complete. Awaiting sign-off from your ${pendingFaculty[0].title} Coordinator.`
                    : "Council clearance is complete. Awaiting sign-off from your Faculty Coordinators."
                  : "Council clearance is the prerequisite and must be completed before faculty sign-offs can proceed."}
              </p>
            </div>
          </div>
          <div className="flex h-2 w-full sm:w-28 lg:w-32 shrink-0 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div
              className="h-full w-full bg-emerald-500 origin-left transition-transform duration-300 ease-out-soft"
              style={{ transform: `scaleX(${clearedCount / 3})` }}
            />
          </div>
        </div>
      )}

      {/* FL-042: shown on every semester, including the current one. */}
      <div className="flex items-center gap-3 rounded-lg border border-border/80 bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
        <History className="size-4 shrink-0 text-muted-foreground/80" />
        <span>
          A confirmation is permanent. Later fee or demerit changes do not reverse it, and it is not a promise of a
          zero current balance.
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-3">
        {cards.map((config) => (
          <ClearanceCard
            key={config.key}
            config={config}
            status={components[config.key]}
            councilCleared={components.council.cleared}
          />
        ))}
      </div>
    </div>
  );
}
