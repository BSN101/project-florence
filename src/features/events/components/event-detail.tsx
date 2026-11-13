"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileUp, Loader2, RefreshCw, ScanLine, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { recordAttendance } from "../actions";
import type { AttendeeRow, EventDTO, EventRulesDTO } from "../contracts";
import { activityEntries, attendeeSummary, canCapture, canGenerate, closesAt, eventPhase } from "../event-state";
import { AttendanceImportDialog } from "./attendance-import-dialog";
import { ConsequencePanel } from "./consequence-panel";
import { Badge, PhaseBadge, StatusBadge, methodLabel } from "./event-badges";

export type EventTab = "attendance" | "activity" | "details" | "consequences";

const date = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" });
const dateTime = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });
const time = new Intl.DateTimeFormat("en-PH", { timeStyle: "short", timeZone: "Asia/Manila" });
const fmt = (value: string | null, f = time) => (value ? f.format(new Date(value)) : "—");
const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

// Left-edge color per status, readable at a glance.
const stripe: Record<string, string> = {
  on_time: "border-l-emerald-500",
  late: "border-l-amber-500",
  absent: "border-l-destructive",
  missing_time_out: "border-l-destructive",
  not_in: "border-l-muted-foreground/30",
};
const initials = (row: Pick<AttendeeRow, "first_name" | "last_name">) =>
  `${row.first_name[0] ?? ""}${row.last_name[0] ?? ""}`.toUpperCase();

function within(from: string | null, until: string | null, at: number) {
  return from !== null && until !== null && at >= Date.parse(from) && at <= Date.parse(until);
}

function Chips<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (value: T) => void;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map(([key, text]) => (
        <button key={key} type="button" role="tab" aria-selected={value === key} onClick={() => onChange(key)}
          className={`rounded-md border px-2.5 py-1 text-xs font-medium ${value === key
            ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>
          {text}
        </button>
      ))}
    </div>
  );
}

/** Event page: attendee list, activity, setup and (Executive/Operations) consequences. */
export function EventDetail({ event, rules, attendees, canManage, viewerId, backHref, initialTab, now: serverNow }: {
  event: EventDTO;
  rules: EventRulesDTO | null;
  attendees: AttendeeRow[];
  canManage: boolean;
  viewerId: string;
  backHref: string;
  initialTab: EventTab;
  /** Server render time; Refresh and every capture re-render with fresh data. */
  now: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<EventTab>(initialTab === "consequences" && !canManage ? "attendance" : initialTab);
  const [importing, setImporting] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const now = Date.parse(serverNow);
  const phase = eventPhase(event, now);
  const capturing = canCapture(event);
  const timeInOpen = capturing && within(event.time_in_from, event.time_in_until, now);
  const timeOutOpen = capturing && within(event.time_out_from, event.time_out_until, now);

  function chooseTab(next: EventTab) {
    setTab(next);
    // Keep the tab in the URL without a server round trip (saves mobile data).
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  }

  const tabs: (readonly [EventTab, string])[] = [["attendance", "Attendance"], ["activity", "Activity"], ["details", "Details"]];
  if (canManage) tabs.push(["consequences", "Consequences"]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <Button variant="ghost" size="sm" className="w-fit gap-1" nativeButton={false} render={<Link href={backHref} />}>
          <ArrowLeft className="size-4" /> All events
        </Button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-foreground">{event.name}</h2>
              <PhaseBadge phase={phase} event={event} />
            </div>
            <p className="text-sm text-muted-foreground">
              {fmt(event.time_in_from, date)} · {fmt(event.time_in_from)} – {fmt(event.time_in_until)}
              {event.venue && ` · ${event.venue}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {timeInOpen && (
              <Button className="gap-1.5" nativeButton={false} render={<Link href={`/council/events/scan?event=${event.id}&side=time_in`} />}>
                <ScanLine className="size-4" /> Scan time-in
              </Button>
            )}
            {timeOutOpen && (
              <Button className="gap-1.5" nativeButton={false} render={<Link href={`/council/events/scan?event=${event.id}&side=time_out`} />}>
                <ScanLine className="size-4" /> Scan time-out
              </Button>
            )}
            {capturing && (
              <Button type="button" variant="outline" className="gap-1.5" onClick={() => setImporting(true)}>
                <FileUp className="size-4" /> Import paper attendance
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-b border-border">
        <nav role="tablist" aria-label="Event sections" className="-mb-px flex gap-1 overflow-x-auto">
          {tabs.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => chooseTab(key)}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${tab === key
                ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {label}
            </button>
          ))}
        </nav>
        <Button type="button" variant="ghost" size="sm" className="shrink-0 gap-1.5 text-xs" disabled={refreshing}
          onClick={() => startRefresh(() => router.refresh())} title={`Last updated ${time.format(now)}`} aria-label="Refresh">
          <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {tab === "attendance" && (
        <AttendanceTab event={event} attendees={attendees} viewerId={viewerId} closed={phase !== "open" && phase !== "upcoming"}
          timeInOpen={timeInOpen} timeOutOpen={timeOutOpen} capturing={capturing} />
      )}
      {tab === "activity" && <ActivityTab attendees={attendees} />}
      {tab === "details" && <DetailsTab event={event} rules={rules} participants={attendees.length} closed={phase !== "open" && phase !== "upcoming"} />}
      {tab === "consequences" && canManage && <ConsequencePanel event={event} canGenerateNow={canGenerate(event, now)} />}

      {importing && <AttendanceImportDialog eventId={event.id} onClose={() => setImporting(false)} />}
    </div>
  );
}

type AttendanceFilter = "all" | "not_in" | "in" | "late" | "missing_time_out";

function AttendanceTab({ event, attendees, viewerId, closed, timeInOpen, timeOutOpen, capturing }: {
  event: EventDTO; attendees: AttendeeRow[]; viewerId: string; closed: boolean;
  timeInOpen: boolean; timeOutOpen: boolean; capturing: boolean;
}) {
  const [filter, setFilter] = useState<AttendanceFilter>("all");
  const [year, setYear] = useState("all");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const live = capturing && (timeInOpen || timeOutOpen);
  const summary = useMemo(() => attendeeSummary(attendees), [attendees]);
  const missing = closed ? summary.absent : summary.not_in;

  function handleRecord(student: AttendeeRow, kind: "time_in" | "time_out") {
    setMessage(null);
    setBusy(`${student.student_id}:${kind}`);
    startTransition(async () => {
      const result = await recordAttendance({ eventId: event.id, studentId: student.student_id, kind, requestKey: crypto.randomUUID() });
      setMessage(result.success
        ? { tone: "success", text: `${result.message} for ${student.last_name}, ${student.first_name}` }
        : { tone: "error", text: result.error });
      setBusy(null);
    });
  }

  function captureButtons(row: AttendeeRow, self: boolean, width = "") {
    return (
      <>
        <Button size="sm" className={width} disabled={isPending || self || row.time_in !== null || !timeInOpen}
          onClick={() => handleRecord(row, "time_in")}>
          {busy === `${row.student_id}:time_in` && <Loader2 className="size-4 animate-spin" />}
          Time in
        </Button>
        <Button size="sm" variant="outline" className={width}
          disabled={isPending || self || row.time_in === null || row.time_out !== null || !timeOutOpen}
          onClick={() => handleRecord(row, "time_out")}>
          {busy === `${row.student_id}:time_out` && <Loader2 className="size-4 animate-spin" />}
          Time out
        </Button>
      </>
    );
  }

  const needle = query.trim().toLowerCase();
  const rows = attendees.filter((row) =>
    (filter === "all" || (filter === "in" ? row.time_in !== null
      : filter === "not_in" ? row.time_in === null : row.status === filter))
    && (year === "all" || String(row.year_level) === year)
    && (status === "all" || row.academic_status === status)
    && (!needle || `${row.first_name} ${row.last_name}`.toLowerCase().includes(needle) || row.university_id.includes(needle)));

  const stats: [string, number | string][] = [
    ["Participants", summary.participants],
    ["Timed in", `${summary.timedIn}${summary.participants ? ` · ${Math.round((summary.timedIn / summary.participants) * 100)}%` : ""}`],
    ["On time", summary.on_time],
    ["Late", summary.late],
    [closed ? "Absent" : "Not yet in", missing],
    ["Timed out", summary.timedOut],
  ];
  if (closed) stats.push(["Missing time-out", summary.missing_time_out]);
  const years = [...new Set(attendees.map((row) => row.year_level))].sort();

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4 lg:grid-cols-7">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-card p-2.5">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-base font-semibold text-foreground">{value}</dd>
          </div>
        ))}
      </dl>

      {capturing && !timeInOpen && !timeOutOpen && (
        <p className="rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
          Recording is closed right now. Time-in opens {fmt(event.time_in_from, dateTime)}; attendance closes {fmt(event.time_in_until)}.
        </p>
      )}

      <div className="space-y-2">
        <Chips label="Filter by attendance" value={filter} onChange={setFilter} options={[
          ["all", `All (${summary.participants})`], ["not_in", `${closed ? "Absent" : "Not yet in"} (${missing})`],
          ["in", `Timed in (${summary.timedIn})`], ["late", `Late (${summary.late})`],
          ...(closed ? [["missing_time_out", `Missing time-out (${summary.missing_time_out})`] as const] : []),
        ]} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search aria-hidden="true" className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Filter by name or university number" placeholder="Filter by name or number" className="pl-8"
              value={query} onChange={(e) => setQuery(e.target.value)} maxLength={100} />
          </div>
          <select aria-label="Year level" value={year} onChange={(e) => setYear(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value="all">All years</option>
            {years.map((y) => <option key={y} value={y}>Year {y}</option>)}
          </select>
          <select aria-label="Academic status" value={status} onChange={(e) => setStatus(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value="all">All statuses</option>
            <option value="regular">Regular</option>
            <option value="irregular">Irregular</option>
          </select>
        </div>
      </div>

      {message && (
        <div role="status" className={`rounded-lg border p-3 text-sm ${message.tone === "error"
          ? "border-destructive/20 bg-destructive/10 text-destructive"
          : "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"}`}>
          {message.text}
        </div>
      )}

      <div className="h-[28rem] overflow-y-auto overscroll-contain rounded-xl border border-border bg-card shadow-xs">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No participants match these filters.</p>
        ) : (
          <>
            {/* Phones: compact cards; tap one to see who recorded each side. */}
            <ul className="divide-y divide-border sm:hidden">
              {rows.map((row) => {
                const self = row.student_id === viewerId;
                const open = expanded === row.student_id;
                return (
                  <li key={row.student_id} className={`border-l-4 ${stripe[row.status] ?? "border-l-transparent"}`}>
                    <button type="button" aria-expanded={open} onClick={() => setExpanded(open ? null : row.student_id)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
                      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                        {initials(row)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium text-foreground">{row.last_name}, {row.first_name}</span>
                          <StatusBadge status={row.status} />
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {row.university_id} · Y{row.year_level} · In {fmt(row.time_in)}{row.time_in && ` ${methodLabel(row.time_in_method)}`}
                          {" · "}Out {fmt(row.time_out)}{row.time_out && ` ${methodLabel(row.time_out_method)}`}
                        </span>
                      </span>
                    </button>
                    {open && (
                      <div className="space-y-0.5 px-3 pb-2.5 pl-15 text-xs text-muted-foreground">
                        <p className="capitalize">{row.academic_status}</p>
                        <p>Time-in {row.time_in ? `${fmt(row.time_in)} · ${methodLabel(row.time_in_method)}${row.time_in_recorded_by ? ` by ${row.time_in_recorded_by}` : ""}` : "not recorded"}</p>
                        <p>Time-out {row.time_out ? `${fmt(row.time_out)} · ${methodLabel(row.time_out_method)}${row.time_out_recorded_by ? ` by ${row.time_out_recorded_by}` : ""}` : "not recorded"}</p>
                        {self && <p>You cannot record your own attendance.</p>}
                      </div>
                    )}
                    {live && <div className="flex gap-2 px-3 pb-3">{captureButtons(row, self, "flex-1")}</div>}
                  </li>
                );
              })}
            </ul>

            {/* Desktop: aligned columns so times are easy to compare. */}
            <table className="hidden w-full text-left text-sm sm:table">
              <thead className="sticky top-0 z-10 border-b border-border bg-muted text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2.5">Student</th>
                  <th scope="col" className="px-4 py-2.5">Year · Status</th>
                  <th scope="col" className="px-4 py-2.5">Status</th>
                  <th scope="col" className="px-4 py-2.5">Time in</th>
                  <th scope="col" className="px-4 py-2.5">Time out</th>
                  {live && <th scope="col" className="px-4 py-2.5 text-right">Record</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => {
                  const self = row.student_id === viewerId;
                  return (
                    <tr key={row.student_id} className={`border-l-4 ${stripe[row.status] ?? "border-l-transparent"}`}>
                      <td className="px-4 py-2">
                        <p className="font-medium text-foreground">{row.last_name}, {row.first_name}</p>
                        <p className="text-xs text-muted-foreground">{row.university_id}{self && " · you"}</p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs capitalize text-muted-foreground">Year {row.year_level} · {row.academic_status}</td>
                      <td className="px-4 py-2"><StatusBadge status={row.status} /></td>
                      <td className="whitespace-nowrap px-4 py-2 tabular-nums" title={row.time_in_recorded_by ? `Recorded by ${row.time_in_recorded_by}` : undefined}>
                        {fmt(row.time_in)} {row.time_in && <span className="text-xs text-muted-foreground">{methodLabel(row.time_in_method)}</span>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 tabular-nums" title={row.time_out_recorded_by ? `Recorded by ${row.time_out_recorded_by}` : undefined}>
                        {fmt(row.time_out)} {row.time_out && <span className="text-xs text-muted-foreground">{methodLabel(row.time_out_method)}</span>}
                      </td>
                      {live && <td className="whitespace-nowrap px-4 py-2 text-right"><div className="inline-flex gap-2">{captureButtons(row, self)}</div></td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

function ActivityTab({ attendees }: { attendees: AttendeeRow[] }) {
  const entries = useMemo(() => activityEntries(attendees), [attendees]);
  const [method, setMethod] = useState<"all" | "qr" | "manual" | "csv">("all");
  const [recorder, setRecorder] = useState("all");
  const recorders = [...new Set(entries.map((e) => e.recordedBy).filter((r): r is string => r !== null))].sort();
  const shown = entries.filter((e) => (method === "all" || e.method === method) && (recorder === "all" || e.recordedBy === recorder));

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Chips label="Filter by method" value={method} onChange={setMethod}
          options={[["all", "All"], ["qr", "QR"], ["manual", "Manual"], ["csv", "CSV"]]} />
        <select aria-label="Recorded by" value={recorder} onChange={(e) => setRecorder(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="all">Everyone</option>
          {recorders.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div className="h-[28rem] overflow-y-auto overscroll-contain rounded-xl border border-border bg-card shadow-xs">
        {shown.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nothing recorded yet.</p>
        ) : (
          <ol className="divide-y divide-border text-sm">
            {shown.map((e) => (
              <li key={e.key} className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                <span className="w-20 shrink-0 tabular-nums text-muted-foreground">{fmt(e.at)}</span>
                <span className="flex flex-wrap items-center gap-2">
                  <Badge tone={e.kind === "time_in" ? "success" : "primary"}>{e.kind === "time_in" ? "Time-in" : "Time-out"}</Badge>
                  <span className="font-medium text-foreground">{e.student}</span>
                  <span className="text-xs text-muted-foreground">{e.universityId}</span>
                </span>
                <span className="text-xs text-muted-foreground sm:ml-auto">
                  {methodLabel(e.method)}{e.recordedBy && ` · by ${e.recordedBy}`}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function DetailsTab({ event, rules, participants, closed }: { event: EventDTO; rules: EventRulesDTO | null; participants: number; closed: boolean }) {
  const setup: [string, string][] = [
    ["Event date", fmt(event.time_in_from, date)],
    ["Venue", event.venue ?? "—"],
    ["Time-in opens", fmt(event.time_in_from)],
    ["Time-out opens", event.time_out_from ? fmt(event.time_out_from) : "No time-out"],
    ["Attendance closes", fmt(new Date(closesAt(event)).toISOString())],
    ["Late after", `${event.late_after_minutes} min from time-in opening`],
    ["Audience", `Year ${event.year_levels.join(", ")} · ${event.academic_statuses.join(", ")}`],
  ];
  if (rules) {
    setup.push(
      ["Missing time-out", rules.requires_time_out ? "Counts as absent" : "Not counted"],
      ["Absence", `${rules.absence_fine_amount != null ? peso.format(rules.absence_fine_amount) : "No fine"} · ${rules.absence_demerit_days} demerit day(s)`],
      ["Late", `${rules.late_fine_amount != null ? peso.format(rules.late_fine_amount) : "No fine"} · ${rules.late_demerit_days} demerit day(s)`],
    );
  }
  const closing = fmt(new Date(closesAt(event)).toISOString(), dateTime);
  // [label, detail, reached]
  const timeline: [string, string | null, boolean][] = [
    ["Published", event.audience_frozen_at && `${fmt(event.audience_frozen_at, dateTime)} · ${participants} participants`, !!event.audience_frozen_at],
    [closed ? "Attendance closed" : "Attendance closes", closing, closed],
    ["Consequences generated", event.attendance_locked_at
      && `${fmt(event.attendance_locked_at, dateTime)}${event.consequence_bucket ? ` · ${event.consequence_bucket === "office" ? "Office" : "RLE"}` : ""}`,
      !!event.attendance_locked_at],
    ["Archived", event.archived_at && fmt(event.archived_at, dateTime), !!event.archived_at],
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 font-semibold text-foreground">Setup</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {setup.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 font-semibold text-foreground">Timeline</h3>
        <ol className="space-y-3 text-sm">
          {timeline.map(([label, value, reached]) => (
            <li key={label} className="flex gap-3">
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${reached ? "bg-primary" : "bg-muted-foreground/30"}`} />
              <div>
                <p className={reached ? "font-medium text-foreground" : "text-muted-foreground"}>{label}</p>
                {value && <p className="text-xs text-muted-foreground">{value}</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
