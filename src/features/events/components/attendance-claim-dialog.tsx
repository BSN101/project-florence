"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { submitAttendanceClaim } from "../actions";
import { SELFIE_CONSENT, SELFIE_CONSENT_VERSION } from "../schemas";
import { SelfieCapture } from "./selfie-capture";

const numberFormat = /^[0-9]{2}-1-[0-9]{5}$/;

/**
 * FL-049: consent, then student number and selfie, then submit. The camera does not
 * start until the student agrees. Consent is asked again on every submission.
 */
export function AttendanceClaimDialog({ eventId, eventName, kind, onClose }: {
  eventId: string; eventName: string; kind: "time_in" | "time_out"; onClose: () => void;
}) {
  const [agreed, setAgreed] = useState(false);
  const [consented, setConsented] = useState(false);
  const [universityId, setUniversityId] = useState("");
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  // One key per dialog: a retry after a lost response replays the first claim.
  const [requestKey] = useState(() => crypto.randomUUID());
  const [isPending, startTransition] = useTransition();
  const side = kind === "time_in" ? "time-in" : "time-out";
  const ready = numberFormat.test(universityId.trim()) && photo !== null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || !photo) return;
    setError(null);
    const form = new FormData();
    form.set("eventId", eventId);
    form.set("kind", kind);
    form.set("universityId", universityId.trim());
    form.set("consentVersion", SELFIE_CONSENT_VERSION);
    form.set("requestKey", requestKey);
    form.set("photo", new File([photo], "selfie.jpg", { type: "image/jpeg" }));
    startTransition(async () => {
      const result = await submitAttendanceClaim(form);
      // The refreshed event row shows the claim as awaiting verification.
      if (result.success) onClose();
      else setError(result.error);
    });
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !isPending) onClose(); }}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log {side} · {eventName}</DialogTitle>
          <DialogDescription>
            {consented ? "Council verifies your photo before your attendance is recorded." : "Read how your photo is used before the camera turns on."}
          </DialogDescription>
        </DialogHeader>

        {!consented ? (
          <div className="flex flex-col gap-5">
            <dl className="space-y-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
              {SELFIE_CONSENT.map(([term, text]) => (
                <div key={term}>
                  <dt className="font-medium text-foreground">{term}</dt>
                  <dd className="text-muted-foreground">{text}</dd>
                </div>
              ))}
            </dl>
            <label className="flex min-h-11 items-start gap-3 text-sm text-foreground">
              <input type="checkbox" className="mt-0.5 size-5 shrink-0" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              I have read this notice and agree to my photo being used to verify my attendance.
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="button" disabled={!agreed} onClick={() => setConsented(true)}>Continue</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-5">
            {error && <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <div className="space-y-1.5">
              <label htmlFor="claim-university-id" className="text-sm font-medium text-foreground">Your student number</label>
              <Input id="claim-university-id" value={universityId} onChange={(e) => setUniversityId(e.target.value)}
                placeholder="XX-1-XXXXX" autoComplete="off" maxLength={10} className="h-11 text-base tabular-nums" />
            </div>
            <SelfieCapture photo={photo} onChange={setPhoto} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
              <Button type="submit" disabled={!ready || isPending}>
                {isPending && <Loader2 className="size-4 animate-spin" />} Submit
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
