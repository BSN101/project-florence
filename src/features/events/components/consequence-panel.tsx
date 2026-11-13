"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { generateConsequences, previewConsequences } from "../actions";
import type { ConsequencePreviewRow, ConsequenceTotals, EventDTO } from "../contracts";

type Bucket = "office" | "rle";
type Filter = "affected" | "absence" | "late" | "clear";

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const time = new Intl.DateTimeFormat("en-PH", { timeStyle: "short", timeZone: "Asia/Manila" });
const bucketLabel = { office: "Office", rle: "RLE" } as const;

/**
 * Review and generate an event's consequences (FL-018). Before attendance closes it is a
 * projection; after generation it is read-only and lists what was generated.
 */
export function ConsequencePanel({ event, canGenerateNow }: { event: EventDTO; canGenerateNow: boolean }) {
  const generated = event.attendance_locked_at !== null;
  const [done, setDone] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ rows: ConsequencePreviewRow[]; totals: ConsequenceTotals } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("affected");
  const [bucket, setBucket] = useState<Bucket | null>(null);
  // One key per review: double clicks and retries replay the first generation.
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    previewConsequences({ eventId: event.id }).then((result) => {
      if (!live) return;
      if (result.success) setPreview({ rows: result.rows, totals: result.totals });
      else setError(result.error);
    });
    return () => { live = false; };
  }, [event.id]);

  function handleGenerate() {
    if (!preview || !bucket) return;
    setError(null);
    startTransition(async () => {
      const result = await generateConsequences({ eventId: event.id, bucket, requestKey, expected: preview.totals });
      if (result.success) {
        // revalidatePath re-renders the page with the locked event and generated list.
        setDone(result.message ?? "Consequences generated.");
        return;
      }
      setError(result.error);
      if (result.error.startsWith("Attendance changed")) {
        // A fresh review is a new decision, so it gets a new key.
        setRequestKey(crypto.randomUUID());
        const fresh = await previewConsequences({ eventId: event.id });
        if (fresh.success) setPreview({ rows: fresh.rows, totals: fresh.totals });
      }
    });
  }

  const rows = preview?.rows.filter((row) =>
    filter === "affected" ? row.outcome !== null : filter === "clear" ? row.outcome === null : row.outcome === filter) ?? [];
  const totals = preview?.totals;
  const clear = preview ? preview.rows.length - (totals!.absent + totals!.late) : 0;

  return (
    <section className="flex flex-col gap-4">
        <div>
          <h3 className="font-semibold text-foreground">{generated ? "Generated consequences" : "Review consequences"}</h3>
          <p className="text-sm text-muted-foreground">
            {generated
              ? `Generated in the ${event.consequence_bucket ? bucketLabel[event.consequence_bucket] : "unrecorded"} bucket. Attendance is locked.`
              : canGenerateNow
                ? "Absences and late arrivals from the recorded attendance. Nothing is created until you generate."
                : "Attendance is still open, so this is a projection: students not yet timed in show as absent. Generation opens when attendance closes."}
          </p>
        </div>
        {done && (
          <div role="status" className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">{done}</div>
        )}

        {error && (
          <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {!preview ? (
          !error && (
            <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading consequences…
            </p>
          )
        ) : (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
              {[["Absent", totals!.absent], ["Late", totals!.late],
                ["Fines", `${totals!.fines} · ${peso.format(totals!.fineTotal)}`], ["Demerit days", totals!.demeritDays]]
                .map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-border bg-card p-2.5">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="text-sm font-semibold text-foreground">{value}</dd>
                  </div>
                ))}
            </dl>

            <div role="tablist" aria-label="Filter participants" className="flex flex-wrap gap-1.5">
              {([["affected", `With consequences (${totals!.absent + totals!.late})`], ["absence", `Absent (${totals!.absent})`],
                ["late", `Late (${totals!.late})`], ["clear", `No consequence (${clear})`]] as const).map(([value, label]) => (
                <button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium ${filter === value
                    ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>
                  {label}
                </button>
              ))}
            </div>

            <div className="h-72 overflow-y-auto overscroll-contain rounded-lg border border-border">
              {rows.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No participants in this list.</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {rows.map((row) => (
                    <li key={row.student_id} className="flex items-start justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{row.last_name}, {row.first_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.university_id} · In {row.time_in ? time.format(new Date(row.time_in)) : "—"}
                          {" · "}Out {row.time_out ? time.format(new Date(row.time_out)) : "—"}
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-xs">
                        <p className={`font-semibold capitalize ${row.outcome ? "text-destructive" : "text-muted-foreground"}`}>
                          {row.outcome ?? "None"}
                        </p>
                        {row.outcome && (
                          <p className="text-muted-foreground">
                            {row.fine_amount !== null ? peso.format(row.fine_amount) : "No fine"} · {row.demerit_days} day{row.demerit_days === 1 ? "" : "s"}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {!generated && canGenerateNow && !done && (
              <>
                <fieldset>
                  <legend className="mb-2 text-sm font-semibold text-foreground">Record demerits in</legend>
                  <div role="radiogroup" aria-label="Demerit bucket" className="grid grid-cols-2 gap-2">
                    {(["office", "rle"] as const).map((value) => (
                      <button key={value} type="button" role="radio" aria-checked={bucket === value} onClick={() => setBucket(value)}
                        disabled={isPending}
                        className={`rounded-lg border px-3 py-2 text-sm font-medium ${bucket === value
                          ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:bg-muted/50"}`}>
                        {bucketLabel[value]}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Applies to this event only, even if no demerits result. It cannot be changed after generating.
                  </p>
                </fieldset>
                <p className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="size-4 shrink-0" />
                  Generating creates these fines and demerits, notifies the students, and permanently locks attendance
                  for every method: manual, QR and CSV import. This cannot be undone.
                </p>
              </>
            )}
          </div>
        )}

        {!generated && canGenerateNow && !done && (
          <div className="flex justify-end">
            <Button type="button" onClick={handleGenerate} disabled={isPending || !preview || !bucket}>
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Generate and lock
            </Button>
          </div>
        )}
    </section>
  );
}
