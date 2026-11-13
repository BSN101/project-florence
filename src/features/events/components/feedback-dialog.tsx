"use client";

import { useState, useTransition } from "react";
import { Info, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { submitFeedback } from "../actions";
import { FEEDBACK_DISCLOSURE, FEEDBACK_QUESTIONS, type FeedbackKey, type FeedbackResponses } from "../feedback";

type Ratings = Partial<Record<FeedbackKey, number>>;

function Scale({ name, label, low, high, value, onChange, readOnly }: {
  name: string; label: string; low: string; high: string; value?: number; onChange?: (value: number) => void; readOnly?: boolean;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-foreground">{label}</legend>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-5 gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" name={name} aria-checked={value === n} disabled={readOnly && value !== n}
            onClick={() => onChange?.(n)} aria-label={`${n}${n === 1 ? ` (${low})` : n === 5 ? ` (${high})` : ""}`}
            className={`h-10 rounded-lg border text-sm font-semibold ${value === n
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-foreground hover:bg-muted/50 disabled:opacity-40"}`}>
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground"><span>{low}</span><span>{high}</span></div>
    </fieldset>
  );
}

/** Fixed identified questionnaire (FL-019). With `submitted`, shows the student's own final answers. */
export function FeedbackDialog({ eventId, eventName, submitted, onClose }: {
  eventId: string; eventName: string; submitted?: FeedbackResponses; onClose: () => void;
}) {
  const [ratings, setRatings] = useState<Ratings>({});
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  // One key per form: double taps and retries reuse it, so only one response is saved.
  const [requestKey] = useState(() => crypto.randomUUID());
  const [isPending, startTransition] = useTransition();
  const complete = FEEDBACK_QUESTIONS.every((q) => ratings[q.key]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!complete) return;
    setError(null);
    startTransition(async () => {
      const result = await submitFeedback({ eventId, requestKey, ...(ratings as Record<FeedbackKey, number>), comment });
      if (result.success) onClose();
      else setError(result.error);
    });
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !isPending) onClose(); }}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{submitted ? "Your feedback" : "Event feedback"} · {eventName}</DialogTitle>
          <DialogDescription>{submitted ? "Submitted answers are final." : "Rate each statement from 1 to 5."}</DialogDescription>
        </DialogHeader>
        <p className="flex gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-foreground">
          <Info className="size-4 shrink-0 text-primary" /> {FEEDBACK_DISCLOSURE}
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {error && <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          {FEEDBACK_QUESTIONS.map((q) => (
            <Scale key={q.key} name={q.key} label={q.text} low={q.low} high={q.high}
              value={submitted ? submitted[q.key] : ratings[q.key]} readOnly={!!submitted}
              onChange={(n) => setRatings((current) => ({ ...current, [q.key]: n }))} />
          ))}
          <div className="space-y-1.5">
            <label htmlFor="feedback-comment" className="text-sm font-medium text-foreground">Comments (optional)</label>
            {submitted ? (
              <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-foreground">{submitted.comment || "No comment."}</p>
            ) : (
              <>
                <textarea id="feedback-comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} rows={3}
                  className="w-full rounded-lg border border-input bg-background p-2.5 text-sm" placeholder="What went well, and what could be better?" />
                <p className="text-right text-[11px] text-muted-foreground">{comment.length}/1000</p>
              </>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>{submitted ? "Close" : "Cancel"}</Button>
            {!submitted && (
              <Button type="submit" disabled={isPending || !complete}>
                {isPending && <Loader2 className="size-4 animate-spin" />} Submit feedback
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
