"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { recordAttendance, searchParticipants } from "../actions";
import type { AttendanceSummary, EventDTO, ParticipantResult } from "../contracts";

const dateTime = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });
const time = new Intl.DateTimeFormat("en-PH", { timeStyle: "short", timeZone: "Asia/Manila" });

// Show stored windows: events published before windows were derived keep their original ones.
function windowLabel(from: string | null, until: string | null) {
  return from && until ? `${dateTime.format(new Date(from))} – ${time.format(new Date(until))}` : "not configured";
}

function within(from: string | null, until: string | null, at: number) {
  return from !== null && until !== null && at >= Date.parse(from) && at <= Date.parse(until);
}

/** Manual attendance capture by restricted participant search. QR capture is a later task. */
export function AttendanceCapture({
  event,
  summary,
  viewerId,
  backHref,
  now: serverNow,
}: {
  event: EventDTO;
  summary: AttendanceSummary;
  viewerId: string;
  backHref: string;
  /** Server render time; refreshed after each capture. The database enforces windows. */
  now: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ParticipantResult[] | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function runSearch(text: string) {
    return searchParticipants({ eventId: event.id, query: text }).then((result) => {
      if (!result.success) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      setResults(result.results);
    });
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(() => runSearch(query));
  }

  function handleRecord(student: ParticipantResult, kind: "time_in" | "time_out") {
    setMessage(null);
    setBusy(`${student.student_id}:${kind}`);
    startTransition(async () => {
      const result = await recordAttendance({
        eventId: event.id, studentId: student.student_id, kind, requestKey: crypto.randomUUID(),
      });
      setMessage(result.success
        ? { tone: "success", text: `${result.message} for ${student.first_name} ${student.last_name}` }
        : { tone: "error", text: result.error });
      await runSearch(query);
      setBusy(null);
    });
  }

  const now = Date.parse(serverNow);
  const timeInOpen = within(event.time_in_from, event.time_in_until, now);
  const timeOutOpen = within(event.time_out_from, event.time_out_until, now);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <Button variant="ghost" size="sm" className="w-fit gap-1" nativeButton={false} render={<Link href={backHref} />}>
          <ArrowLeft className="size-4" /> All events
        </Button>
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">{event.name}</h2>
          <p className="text-sm text-muted-foreground">
            Time-in {windowLabel(event.time_in_from, event.time_in_until)}
            {" · "}Time-out {windowLabel(event.time_out_from, event.time_out_until)}
            {" · "}Late after {event.late_after_minutes} min
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-3 text-center">
          {[["Participants", summary.participants], ["Timed in", summary.timedIn], ["Timed out", summary.timedOut]].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border bg-card p-3">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-lg font-semibold text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {!timeInOpen && !timeOutOpen && (
        <p className="rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
          Recording is closed right now. It is only accepted during the time-in and time-out windows shown above.
        </p>
      )}

      <form onSubmit={handleSearch} className="flex gap-2">
        <Input aria-label="Search participant by name or university number" placeholder="Name or university number"
          value={query} onChange={(e) => setQuery(e.target.value)} minLength={2} maxLength={100} required />
        <Button type="submit" disabled={isPending} className="gap-1.5">
          {isPending && !busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          Search
        </Button>
      </form>

      {message && (
        <div role="status" className={`rounded-lg border p-3 text-sm ${message.tone === "error"
          ? "border-destructive/20 bg-destructive/10 text-destructive"
          : "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"}`}>
          {message.text}
        </div>
      )}

      {results && (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          {results.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No participant of this event matches that search.</p>
          ) : (
            <ul className="divide-y divide-border">
              {results.map((student) => {
                const self = student.student_id === viewerId;
                return (
                  <li key={student.student_id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium text-foreground">{student.last_name}, {student.first_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {student.university_id} · Year {student.year_level} · <span className="capitalize">{student.academic_status}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        In: {student.time_in ? time.format(new Date(student.time_in)) : "—"} · Out: {student.time_out ? time.format(new Date(student.time_out)) : "—"}
                        {self && " · You cannot record your own attendance"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" disabled={isPending || self || student.time_in !== null || !timeInOpen}
                        onClick={() => handleRecord(student, "time_in")}>
                        {busy === `${student.student_id}:time_in` && <Loader2 className="size-4 animate-spin" />}
                        Time in
                      </Button>
                      <Button size="sm" variant="outline"
                        disabled={isPending || self || student.time_in === null || student.time_out !== null || !timeOutOpen}
                        onClick={() => handleRecord(student, "time_out")}>
                        {busy === `${student.student_id}:time_out` && <Loader2 className="size-4 animate-spin" />}
                        Time out
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
