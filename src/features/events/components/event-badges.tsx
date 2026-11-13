import type { AttendeeStatus, EventDTO } from "../contracts";
import type { EventPhase } from "../event-state";

const tones = {
  muted: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warning: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  danger: "bg-destructive/10 text-destructive",
} as const;

export function Badge({ children, tone = "muted" }: { children: React.ReactNode; tone?: keyof typeof tones }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

const phases: Record<EventPhase, [string, keyof typeof tones]> = {
  draft: ["Draft", "primary"],
  upcoming: ["Upcoming", "muted"],
  open: ["Capture open", "success"],
  closed: ["Awaiting consequences", "warning"],
  generated: ["Consequences generated", "muted"],
  archived: ["Archived", "muted"],
};

export function PhaseBadge({ phase, event }: { phase: EventPhase; event: Pick<EventDTO, "consequence_bucket"> }) {
  const [label, tone] = phases[phase];
  const bucket = phase === "generated" && event.consequence_bucket ? ` · ${event.consequence_bucket === "office" ? "Office" : "RLE"}` : "";
  return <Badge tone={tone}>{label}{bucket}</Badge>;
}

const statuses: Record<AttendeeStatus, [string, keyof typeof tones]> = {
  not_in: ["Not yet in", "muted"],
  on_time: ["On time", "success"],
  late: ["Late", "warning"],
  absent: ["Absent", "danger"],
  missing_time_out: ["Missing time-out", "danger"],
};

export function StatusBadge({ status }: { status: string }) {
  const [label, tone] = statuses[status as AttendeeStatus] ?? [status, "muted"];
  return <Badge tone={tone}>{label}</Badge>;
}

export const methodLabel = (method: string | null) => (method === "qr" ? "QR" : method === "csv" ? "CSV" : method === "manual" ? "Manual" : "—");
