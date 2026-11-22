"use client";

import { useState } from "react";
import { Camera, MessageSquareText } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { MyClaim, MyEventRow } from "../contracts";
import type { FeedbackResponses } from "../feedback";
import { Badge, StatusBadge } from "./event-badges";
import { AttendanceClaimDialog } from "./attendance-claim-dialog";
import { FeedbackDialog } from "./feedback-dialog";

const date = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" });
const time = new Intl.DateTimeFormat("en-PH", { timeStyle: "short", timeZone: "Asia/Manila" });
const fmt = (value: string | null, f = time) => (value ? f.format(new Date(value)) : "—");
const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

type Group = "ongoing" | "upcoming" | "past";
type Side = "time_in" | "time_out";
const sideLabel = { time_in: "Time-in", time_out: "Time-out" } as const;

/**
 * A student's own events (FL-015) with selfie attendance claims (FL-049) and feedback (FL-019).
 * `feedback_opens_at` is when attendance closes. `claims` is newest first.
 */
export function StudentEvents({ events, feedback, claims, now: serverNow }: {
  events: MyEventRow[];
  feedback: Record<string, FeedbackResponses>;
  claims: MyClaim[];
  now: string;
}) {
  const [open, setOpen] = useState<{ event: MyEventRow; submitted?: FeedbackResponses } | null>(null);
  const [claiming, setClaiming] = useState<{ event: MyEventRow; kind: Side } | null>(null);
  const now = Date.parse(serverNow);
  const latest = (e: MyEventRow, kind: Side) => claims.find((c) => c.event_id === e.event_id && c.kind === kind);
  const within = (from: string | null, until: string | null) => !!from && !!until && now >= Date.parse(from) && now <= Date.parse(until);

  /** The side a selfie can be logged for now, if any. The server re-checks everything. */
  function claimableSide(e: MyEventRow): Side | null {
    if (e.attendance_locked_at) return null;
    const open = (c?: MyClaim) => c?.status === "pending" || c?.status === "verified";
    const timeIn = latest(e, "time_in");
    if (!e.time_in && within(e.time_in_from, e.time_in_until) && !open(timeIn)) return "time_in";
    if (!e.time_out && within(e.time_out_from, e.time_out_until) && !open(latest(e, "time_out"))
      && (e.time_in || timeIn?.status === "pending")) return "time_out";
    return null;
  }

  function claimArea(e: MyEventRow) {
    const notes = (["time_in", "time_out"] as const).flatMap((kind) => {
      const c = latest(e, kind);
      if (c?.status === "pending") return [<Badge key={kind} tone="warning">{sideLabel[kind]} photo awaiting verification</Badge>];
      if (c?.status === "rejected") {
        return [<p key={kind} className="text-xs text-destructive">{sideLabel[kind]} photo rejected: {c.rejection_reason}</p>];
      }
      return [];
    });
    const side = claimableSide(e);
    if (!notes.length && !side) return null;
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col items-start gap-1">{notes}</div>
        {side && (
          <Button size="sm" className="gap-1.5" onClick={() => setClaiming({ event: e, kind: side })}>
            <Camera className="size-4" /> Log {side === "time_in" ? "time-in" : "time-out"}
          </Button>
        )}
      </div>
    );
  }

  const group = (e: MyEventRow): Group =>
    e.time_in_from && now < Date.parse(e.time_in_from) ? "upcoming"
      : !e.attendance_locked_at && now < Date.parse(e.feedback_opens_at) ? "ongoing" : "past";
  const groups: [Group, string][] = [["ongoing", "Happening now"], ["upcoming", "Upcoming"], ["past", "Past"]];

  if (events.length === 0) {
    return <p className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">You have no events in this semester.</p>;
  }

  function feedbackArea(e: MyEventRow) {
    const opens = Date.parse(e.feedback_opens_at);
    const closes = Date.parse(e.feedback_closes_at);
    if (e.feedback_submitted_at) {
      return (
        <div className="flex items-center justify-between gap-2">
          <Badge tone="success">Feedback submitted</Badge>
          <Button size="sm" variant="ghost" className="text-xs" onClick={() => setOpen({ event: e, submitted: feedback[e.event_id] })}>
            View my answers
          </Button>
        </div>
      );
    }
    if (now < opens) return null;
    if (!e.feedback_eligible) return <p className="text-xs text-muted-foreground">Feedback is for participants who attended.</p>;
    if (now > closes) return <p className="text-xs text-muted-foreground">The feedback period has ended.</p>;
    const daysLeft = Math.max(1, Math.ceil((closes - now) / 86_400_000));
    return (
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Open for {daysLeft} more day{daysLeft === 1 ? "" : "s"}</p>
        <Button size="sm" className="gap-1.5" onClick={() => setOpen({ event: e })}>
          <MessageSquareText className="size-4" /> Give feedback
        </Button>
      </div>
    );
  }

  function consequences(e: MyEventRow) {
    if (!e.attendance_locked_at) return null;
    const parts: string[] = [];
    if (e.fine_amount !== null) parts.push(`Fine ${peso.format(e.fine_amount)}${e.fine_waived ? " (waived)" : ""}`);
    if (e.demerit_days > 0) parts.push(`${e.demerit_days} demerit day${e.demerit_days === 1 ? "" : "s"}${e.consequence_bucket ? ` · ${e.consequence_bucket === "office" ? "Office" : "RLE"}` : ""}`);
    return (
      <p className={`text-xs ${parts.length ? "text-destructive" : "text-muted-foreground"}`}>
        {parts.length ? parts.join(" · ") : "No consequences for this event."}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map(([key, label]) => {
        const list = events.filter((e) => group(e) === key);
        if (list.length === 0) return null;
        return (
          <section key={key} className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">{label} <span className="text-muted-foreground">({list.length})</span></h3>
            <ul className="space-y-2">
              {list.map((e) => (
                <li key={e.event_id} className="space-y-2 rounded-xl border border-border bg-card p-4 shadow-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{e.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmt(e.time_in_from, date)} · {fmt(e.time_in_from)} – {fmt(e.time_in_until)}{e.venue && ` · ${e.venue}`}
                      </p>
                    </div>
                    {key === "upcoming" ? <Badge>Upcoming</Badge> : <StatusBadge status={e.status} />}
                  </div>
                  {key !== "upcoming" && (
                    <p className="text-xs text-muted-foreground">
                      Time in {fmt(e.time_in)} · Time out {e.time_out_from ? fmt(e.time_out) : "not required"}
                    </p>
                  )}
                  {claimArea(e)}
                  {consequences(e)}
                  {feedbackArea(e)}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {claiming && (
        <AttendanceClaimDialog key={`${claiming.event.event_id}:${claiming.kind}`} eventId={claiming.event.event_id}
          eventName={claiming.event.name} kind={claiming.kind} onClose={() => setClaiming(null)} />
      )}
      {open && (
        <FeedbackDialog key={open.event.event_id} eventId={open.event.event_id} eventName={open.event.name}
          submitted={open.submitted} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}
