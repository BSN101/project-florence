"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getClaimPhotoUrl, reviewAttendanceClaim } from "../actions";
import type { AttendeeRow, ClaimQueueRow } from "../contracts";
import { Badge } from "./event-badges";

const time = new Intl.DateTimeFormat("en-PH", { timeStyle: "short", timeZone: "Asia/Manila" });
const sideLabel = { time_in: "Time-in", time_out: "Time-out" } as const;
const reasons = ["Face not clearly visible", "Not the student", "Not taken at the event"];

type Person = Pick<AttendeeRow, "first_name" | "last_name" | "university_id">;

/**
 * FL-050 Verification tab: pending selfie claims, oldest first. A reviewer opens one,
 * sees the photo, and verifies or rejects it; the dialog then moves on to the next claim.
 * Only name, number, side, time and photo are shown (D2).
 */
export function ClaimReview({ claims, attendees, viewerId }: {
  claims: ClaimQueueRow[]; attendees: AttendeeRow[]; viewerId: string;
}) {
  const people = new Map<string, Person>(attendees.map((a) => [a.student_id, a]));
  // Decided here but not yet gone from the refreshed list.
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const queue = claims.filter((c) => !done.has(c.id));
  const reviewable = queue.filter((c) => c.student_id !== viewerId);
  const open = queue.find((c) => c.id === openId) ?? null;

  function decided(id: string) {
    setDone((current) => new Set(current).add(id));
    const next = reviewable.find((c) => c.id !== id);
    setOpenId(next?.id ?? null);
  }

  if (queue.length === 0) {
    return <p className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">No attendance photos are waiting for verification.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{queue.length} photo{queue.length === 1 ? "" : "s"} waiting, oldest first</p>
        {reviewable.length > 0 && <Button size="sm" onClick={() => setOpenId(reviewable[0].id)}>Start review</Button>}
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {queue.map((c) => {
          const person = people.get(c.student_id);
          const self = c.student_id === viewerId;
          return (
            <li key={c.id} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{person ? `${person.last_name}, ${person.first_name}` : "Participant"}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {person?.university_id} · {sideLabel[c.kind as keyof typeof sideLabel]} · {time.format(new Date(c.submitted_at))}
                </p>
              </div>
              {self ? <Badge>Your claim</Badge> : (
                <Button size="sm" variant="outline" onClick={() => setOpenId(c.id)}>Review</Button>
              )}
            </li>
          );
        })}
      </ul>
      {open && (
        <ReviewDialog key={open.id} claim={open} person={people.get(open.student_id)}
          remaining={reviewable.length} onDecided={() => decided(open.id)} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}

function ReviewDialog({ claim, person, remaining, onDecided, onClose }: {
  claim: ClaimQueueRow; person?: Person; remaining: number; onDecided: () => void; onClose: () => void;
}) {
  const [photo, setPhoto] = useState<{ url?: string; error?: string } | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  // One key per claim: a double tap or retry replays the first decision.
  const [requestKey] = useState(() => crypto.randomUUID());
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let current = true;
    getClaimPhotoUrl({ claimId: claim.id }).then((result) => {
      if (current) setPhoto(result.success ? { url: result.url } : { error: result.error });
    });
    return () => { current = false; };
  }, [claim.id]);

  function decide(decision: "verify" | "reject") {
    setError(null);
    startTransition(async () => {
      const result = await reviewAttendanceClaim({ claimId: claim.id, decision, requestKey, reason: decision === "reject" ? reason : undefined });
      if (result.success) onDecided();
      else setError(result.error);
    });
  }

  const side = sideLabel[claim.kind as keyof typeof sideLabel];
  return (
    <Dialog open onOpenChange={(next) => { if (!next && !isPending) onClose(); }}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{person ? `${person.last_name}, ${person.first_name}` : "Participant"}</DialogTitle>
          <DialogDescription className="tabular-nums">
            {person?.university_id} · {side} at {time.format(new Date(claim.submitted_at))} · {remaining} to review
          </DialogDescription>
        </DialogHeader>
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
        {error && <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        {rejecting && (
          <div className="space-y-2">
            <label htmlFor="claim-reason" className="text-sm font-medium text-foreground">Reason, shown to the student</label>
            <div className="flex flex-wrap gap-1.5">
              {reasons.map((r) => (
                <button key={r} type="button" onClick={() => setReason(r)}
                  className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">{r}</button>
              ))}
            </div>
            <textarea id="claim-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2}
              className="w-full rounded-lg border border-input bg-background p-2.5 text-base sm:text-sm" />
          </div>
        )}
        <DialogFooter>
          {rejecting ? (
            <>
              <Button type="button" variant="outline" disabled={isPending} onClick={() => setRejecting(false)}>Back</Button>
              <Button type="button" variant="destructive" disabled={isPending || !reason.trim()} onClick={() => decide("reject")}>
                {isPending && <Loader2 className="size-4 animate-spin" />} Reject photo
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" disabled={isPending} onClick={() => setRejecting(true)}>Reject…</Button>
              <Button type="button" disabled={isPending || !photo?.url} onClick={() => decide("verify")}>
                {isPending && <Loader2 className="size-4 animate-spin" />} Verify {side.toLowerCase()}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
