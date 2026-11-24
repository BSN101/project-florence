"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getClaimPhotoUrl, reviewAttendanceClaim } from "../actions";
import { canVerify, groupClaims, nextClaim, type ClaimDecision, type ClaimSide, type StudentClaims } from "../claim-queue";
import type { AttendeeRow, ClaimQueueRow } from "../contracts";
import { Badge, methodLabel } from "./event-badges";

const time = new Intl.DateTimeFormat("en-PH", { timeStyle: "short", timeZone: "Asia/Manila" });
const sideLabel = { time_in: "Time in", time_out: "Time out" } as const;
const reasons = ["Face not clearly visible", "Not the student", "Not taken at the event"];

type Person = Pick<AttendeeRow, "first_name" | "last_name" | "university_id" | "time_in" | "time_in_method" | "time_out" | "time_out_method">;

const personName = (person?: Person) => (person ? `${person.last_name}, ${person.first_name}` : "Participant");

/**
 * FL-050 Verification tab: one row per student with waiting selfie claims, longest-waiting first.
 * Review opens the student and steps through time-in, then time-out, one decision per photo.
 * Only name, number, side, time and photo are shown (D2).
 */
export function ClaimReview({ claims, attendees, viewerId }: {
  claims: ClaimQueueRow[]; attendees: AttendeeRow[]; viewerId: string;
}) {
  const people = new Map<string, Person>(attendees.map((a) => [a.student_id, a]));
  // Decided here but not yet gone from the refreshed list.
  const [decided, setDecided] = useState<Map<string, ClaimDecision>>(() => new Map());
  const [openId, setOpenId] = useState<string | null>(null);
  const groups = groupClaims(claims, decided);
  const reviewable = groups.filter((g) => g.student_id !== viewerId);
  const open = reviewable.find((g) => g.student_id === openId) ?? null;

  function onDecided(claim: ClaimQueueRow, decision: ClaimDecision) {
    const next = new Map(decided).set(claim.id, decision);
    setDecided(next);
    // Stay on this student while a side is left; otherwise move to the next student.
    const still = groupClaims(claims, next).find((g) => g.student_id === claim.student_id);
    if (!still) setOpenId(reviewable.find((g) => g.student_id !== claim.student_id)?.student_id ?? null);
  }

  if (groups.length === 0) {
    return <p className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">No attendance photos are waiting for verification.</p>;
  }

  const cell = (group: StudentClaims, side: ClaimSide) => <SideCell claim={group[side]} person={people.get(group.student_id)} side={side} />;
  const action = (group: StudentClaims, className = "") => group.student_id === viewerId ? <Badge>Your claim</Badge> : (
    <Button size="sm" variant="outline" className={`max-sm:min-h-11 ${className}`} onClick={() => setOpenId(group.student_id)}>Review</Button>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{groups.length} student{groups.length === 1 ? "" : "s"} waiting, longest first</p>
        {reviewable.length > 0 && <Button size="sm" className="max-sm:min-h-11" onClick={() => setOpenId(reviewable[0].student_id)}>Start review</Button>}
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        {/* Phones: one card per student with both sides stacked. */}
        <ul className="divide-y divide-border sm:hidden">
          {groups.map((group) => {
            const person = people.get(group.student_id);
            return (
              <li key={group.student_id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate font-medium text-foreground">{personName(person)}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{person?.university_id}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    <span className="flex items-center gap-1"><span className="text-muted-foreground">In</span>{cell(group, "time_in")}</span>
                    <span className="flex items-center gap-1"><span className="text-muted-foreground">Out</span>{cell(group, "time_out")}</span>
                  </div>
                </div>
                {action(group)}
              </li>
            );
          })}
        </ul>

        {/* Desktop: aligned columns so both sides read across. */}
        <table className="hidden w-full text-left text-sm sm:table">
          <thead className="border-b border-border bg-muted text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2.5">Student</th>
              <th scope="col" className="px-4 py-2.5">Time in</th>
              <th scope="col" className="px-4 py-2.5">Time out</th>
              <th scope="col" className="px-4 py-2.5 text-right"><span className="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {groups.map((group) => {
              const person = people.get(group.student_id);
              return (
                <tr key={group.student_id}>
                  <td className="px-4 py-2">
                    <p className="font-medium text-foreground">{personName(person)}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{person?.university_id}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">{cell(group, "time_in")}</td>
                  <td className="whitespace-nowrap px-4 py-2">{cell(group, "time_out")}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">{action(group)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {open && (
        <ReviewDialog key={open.student_id} group={open} person={people.get(open.student_id)}
          decided={decided} remaining={reviewable.length} onDecided={onDecided} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}

/** A side's state: a waiting photo, a time already recorded another way, or nothing yet. */
function SideCell({ claim, person, side }: { claim?: ClaimQueueRow; person?: Person; side: ClaimSide }) {
  if (claim) return <Badge tone="warning">Photo · {time.format(new Date(claim.submitted_at))}</Badge>;
  const recorded = person?.[side];
  if (!recorded) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="tabular-nums text-foreground">
      {time.format(new Date(recorded))} <span className="text-xs text-muted-foreground">{methodLabel(person?.[`${side}_method`] ?? null)}</span>
    </span>
  );
}

/** One student at a time: time-in photo first, then time-out, each with its own decision. */
function ReviewDialog({ group, person, decided, remaining, onDecided, onClose }: {
  group: StudentClaims; person?: Person; decided: ReadonlyMap<string, ClaimDecision>; remaining: number;
  onDecided: (claim: ClaimQueueRow, decision: ClaimDecision) => void; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const left = Number(Boolean(group.time_in)) + Number(Boolean(group.time_out));
  // The sides waiting when the dialog opened, for "Step n of m".
  const [opened] = useState(() => ({ total: left, timeInId: group.time_in?.id }));
  const claim = nextClaim(group)!;
  // A time-in verified in this dialog counts before the refreshed attendance arrives.
  const timeInRecorded = Boolean(person?.time_in) || (opened.timeInId !== undefined && decided.get(opened.timeInId) === "verify");

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{personName(person)}</DialogTitle>
          <DialogDescription className="tabular-nums">
            {person?.university_id} · {remaining} student{remaining === 1 ? "" : "s"} to review
          </DialogDescription>
        </DialogHeader>
        <ClaimStep key={claim.id} claim={claim} step={opened.total - left + 1} steps={opened.total}
          canVerifyClaim={canVerify(claim, timeInRecorded)} alsoRejectsTimeOut={claim.kind === "time_in" && Boolean(group.time_out)}
          onBusy={setBusy} onDecided={(decision) => onDecided(claim, decision)} />
      </DialogContent>
    </Dialog>
  );
}

function ClaimStep({ claim, step, steps, canVerifyClaim, alsoRejectsTimeOut, onBusy, onDecided }: {
  claim: ClaimQueueRow; step: number; steps: number; canVerifyClaim: boolean; alsoRejectsTimeOut: boolean;
  onBusy: (busy: boolean) => void; onDecided: (decision: ClaimDecision) => void;
}) {
  const [photo, setPhoto] = useState<{ url?: string; error?: string } | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  // One key per claim: a double tap or retry replays the first decision.
  const [requestKey] = useState(() => crypto.randomUUID());
  const [isPending, startTransition] = useTransition();
  const side = sideLabel[claim.kind as ClaimSide];

  useEffect(() => {
    let current = true;
    getClaimPhotoUrl({ claimId: claim.id }).then((result) => {
      if (current) setPhoto(result.success ? { url: result.url } : { error: result.error });
    });
    return () => { current = false; };
  }, [claim.id]);

  useEffect(() => { onBusy(isPending); }, [isPending, onBusy]);

  function decide(decision: ClaimDecision) {
    setError(null);
    startTransition(async () => {
      const result = await reviewAttendanceClaim({ claimId: claim.id, decision, requestKey, reason: decision === "reject" ? reason : undefined });
      if (result.success) onDecided(decision);
      else setError(result.error);
    });
  }

  return (
    <>
      <p className="text-sm font-medium text-foreground tabular-nums">
        {steps > 1 && <span className="text-muted-foreground">Step {step} of {steps} · </span>}
        {side} photo at {time.format(new Date(claim.submitted_at))}
      </p>
      <div className="mx-auto flex aspect-[3/4] w-full max-w-xs items-center justify-center overflow-hidden rounded-2xl bg-muted">
        {photo?.url ? (
          // A short-lived signed link to a private object; next/image would proxy and cache it.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.url} alt={`Selfie submitted for ${side.toLowerCase()}`} className="size-full object-cover" />
        ) : photo?.error ? (
          <p className="p-4 text-center text-sm text-muted-foreground">{photo.error}</p>
        ) : (
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading photo" />
        )}
      </div>
      {!canVerifyClaim && !rejecting && (
        <p className="rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground">Record a time in first. You can still reject this photo.</p>
      )}
      {error && <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {rejecting && (
        <div className="space-y-2">
          <label htmlFor="claim-reason" className="text-sm font-medium text-foreground">Reason, shown to the student</label>
          <div className="flex flex-wrap gap-1.5">
            {reasons.map((r) => (
              <button key={r} type="button" onClick={() => setReason(r)}
                className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground max-sm:min-h-11">{r}</button>
            ))}
          </div>
          <textarea id="claim-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2}
            className="w-full rounded-lg border border-input bg-background p-2.5 text-base sm:text-sm" />
          {alsoRejectsTimeOut && <p className="text-xs text-muted-foreground">This also rejects their waiting time-out photo.</p>}
        </div>
      )}
      <DialogFooter>
        {rejecting ? (
          <>
            <Button type="button" variant="outline" className="max-sm:min-h-11" disabled={isPending} onClick={() => setRejecting(false)}>Back</Button>
            <Button type="button" variant="destructive" className="max-sm:min-h-11" disabled={isPending || !reason.trim()} onClick={() => decide("reject")}>
              {isPending && <Loader2 className="size-4 animate-spin" />} Reject {side.toLowerCase()}
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="outline" className="max-sm:min-h-11" disabled={isPending} onClick={() => setRejecting(true)}>Reject…</Button>
            <Button type="button" className="max-sm:min-h-11" disabled={isPending || !photo?.url || !canVerifyClaim} onClick={() => decide("verify")}>
              {isPending && <Loader2 className="size-4 animate-spin" />} Verify {side.toLowerCase()}
            </Button>
          </>
        )}
      </DialogFooter>
    </>
  );
}
