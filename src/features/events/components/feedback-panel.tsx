"use client";

import type { FeedbackRow } from "../contracts";
import { FEEDBACK_QUESTIONS, summarizeFeedback, type FeedbackResponses } from "../feedback";

const dateTime = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });

/** Identified responses and summaries (FL-019), Executive/Operations only. */
export function FeedbackPanel({ rows, attended, opensAt, closesAt }: {
  rows: FeedbackRow[];
  /** Participants who timed in: the only ones who can respond. */
  attended: number;
  opensAt: string;
  closesAt: string;
}) {
  const responses = rows.map((row) => row.responses as Partial<FeedbackResponses>);
  const summary = summarizeFeedback(responses);
  const comments = rows.filter((row) => (row.responses as Partial<FeedbackResponses>).comment);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="font-semibold text-foreground">Feedback</h3>
          <p className="text-xs text-muted-foreground">
            Open {dateTime.format(new Date(opensAt))} – {dateTime.format(new Date(closesAt))} for participants who attended.
            Responses are identified and final.
          </p>
        </div>
        <p className="text-sm text-foreground">
          <span className="font-semibold">{rows.length}</span> of {attended} responded
          {attended > 0 && <span className="text-muted-foreground"> · {Math.round((rows.length / attended) * 100)}%</span>}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-border bg-card py-10 text-center text-sm text-muted-foreground">No responses yet.</p>
      ) : (
        <>
          <ul className="grid gap-2 lg:grid-cols-2">
            {summary.map((q) => {
              const max = Math.max(...q.counts, 1);
              return (
                <li key={q.key} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-foreground">{q.text}</p>
                    <p className="shrink-0 text-lg font-semibold text-foreground">{q.average ?? "—"}<span className="text-xs font-normal text-muted-foreground">/5</span></p>
                  </div>
                  <div className="mt-2 space-y-1" aria-label={`Ratings for: ${q.text}`}>
                    {[5, 4, 3, 2, 1].map((n) => (
                      <div key={n} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="w-3 text-right">{n}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${(q.counts[n - 1] / max) * 100}%` }} />
                        </div>
                        <span className="w-6 text-right tabular-nums">{q.counts[n - 1]}</span>
                      </div>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>

          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-foreground">Comments ({comments.length})</h4>
            <div className="max-h-72 overflow-y-auto overscroll-contain rounded-xl border border-border bg-card">
              {comments.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No comments.</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {comments.map((row) => (
                    <li key={row.student_id} className="px-4 py-2.5">
                      <p className="text-foreground">{(row.responses as Partial<FeedbackResponses>).comment}</p>
                      <p className="text-xs text-muted-foreground">{row.last_name}, {row.first_name} · {row.university_id}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-foreground">Responses</h4>
            <div className="max-h-[28rem] overflow-auto overscroll-contain rounded-xl border border-border bg-card">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 border-b border-border bg-muted text-xs font-semibold text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2">Student</th>
                    {FEEDBACK_QUESTIONS.map((q, i) => <th key={q.key} scope="col" className="px-2 py-2 text-center" title={q.text}>Q{i + 1}</th>)}
                    <th scope="col" className="px-3 py-2">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => {
                    const r = row.responses as Partial<FeedbackResponses>;
                    return (
                      <tr key={row.student_id}>
                        <td className="whitespace-nowrap px-3 py-2">
                          <p className="font-medium text-foreground">{row.last_name}, {row.first_name}</p>
                          <p className="text-xs text-muted-foreground">{row.university_id}</p>
                        </td>
                        {FEEDBACK_QUESTIONS.map((q) => <td key={q.key} className="px-2 py-2 text-center tabular-nums">{r[q.key] ?? "—"}</td>)}
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{dateTime.format(new Date(row.submitted_at))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              {FEEDBACK_QUESTIONS.map((q, i) => `Q${i + 1}: ${q.text}`).join(" · ")}
            </p>
          </section>
        </>
      )}
    </div>
  );
}
