"use client";

import { useId, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileUp,
  RefreshCw,
  Send,
  Upload,
  UserCheck,
  UserPlus,
  X,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { applyRosterImportAction, previewRosterImportAction } from "../actions";
import type { RosterImportPreview, RosterImportRowResult } from "../contracts";
import { rosterFixCsv } from "../csv";
import { downloadCsv } from "./download-csv";
import { ProgressBar } from "./progress-bar";

type Stage = "upload" | "checking" | "review" | "importing" | "done" | "failed";
type Filter = "all" | "ready" | "conflict" | "invalid";
type Summary = { total: number; created: number; re_enrolled: number; updated: number };

const STEPS = ["Upload", "Review", "Import", "Done"] as const;
const stepOf: Record<Stage, number> = { upload: 0, checking: 0, review: 1, importing: 2, failed: 2, done: 3 };

const statusStyles: Record<string, string> = {
  ready: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  conflict: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  invalid: "bg-destructive/10 text-destructive border-destructive/20",
};

const actionConfig: Record<string, { label: string; icon: typeof UserPlus }> = {
  create: { label: "New student", icon: UserPlus },
  re_enroll: { label: "Re-enroll", icon: UserCheck },
  update: { label: "Update", icon: RefreshCw },
  none: { label: "—", icon: UserPlus },
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const manilaTime = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });

/** Stepper; on phones it collapses to one "Step 2 of 4" line. */
function StepTracker({ current }: { current: number }) {
  return (
    <>
      <p className="text-xs font-medium text-muted-foreground sm:hidden">
        Step {current + 1} of {STEPS.length} · <span className="text-foreground">{STEPS[current]}</span>
      </p>
      <ol aria-label="Import steps" className="hidden items-center gap-2 text-xs sm:flex">
        {STEPS.map((step, i) => (
          <li key={step} aria-current={i === current ? "step" : undefined} className="flex flex-1 items-center gap-2 last:flex-none">
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                i < current && "border-primary bg-primary text-primary-foreground",
                i === current && "border-primary text-primary",
                i > current && "border-border text-muted-foreground",
              )}
            >
              {i < current ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={cn("font-medium", i <= current ? "text-foreground" : "text-muted-foreground")}>{step}</span>
            {i < STEPS.length - 1 && <span className={cn("h-px flex-1", i < current ? "bg-primary" : "bg-border")} />}
          </li>
        ))}
      </ol>
    </>
  );
}

/** One bar split by outcome, with a legend that carries the numbers for screen readers. */
function SummaryBar({ preview }: { preview: RosterImportPreview }) {
  const total = preview.rows.length;
  const segments = [
    { label: "New", count: preview.created, color: "bg-emerald-600" },
    { label: "Re-enrolled", count: preview.re_enrolled, color: "bg-emerald-400" },
    { label: "Updated", count: preview.updated, color: "bg-sky-500" },
    { label: "Conflicts", count: preview.conflicts, color: "bg-amber-500" },
    { label: "Invalid", count: preview.invalid, color: "bg-destructive" },
  ].filter((s) => s.count > 0);
  return (
    <div className="flex flex-col gap-2.5">
      <div aria-hidden className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted">
        {segments.map((s) => (
          <div key={s.label} className={s.color} style={{ width: `${(s.count / total) * 100}%` }} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", s.color)} />
            {s.label}
            <strong className="font-semibold tabular-nums text-foreground">{s.count}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ImportRosterDialog({
  open,
  onOpenChange,
  semesterLabel,
  inviteCount,
  onInvite,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  semesterLabel: string;
  /** Uninvited, eligible students in the semester after the import (fresh from the server). */
  inviteCount: number;
  onInvite: () => void;
}) {
  const [stage, setStage] = useState<Stage>("upload");
  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<RosterImportPreview | null>(null);
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ message: string; summary: Summary; at: Date } | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputId = useId();
  const busy = stage === "checking" || stage === "importing";

  const reset = () => {
    setStage("upload");
    setCsvText(null);
    setFileName(null);
    setPreview(null);
    setRequestKey(null);
    setError(null);
    setResult(null);
    setFilter("all");
    setIsDragging(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && busy) return; // closing mid-request would hide the outcome
    onOpenChange(next);
    if (!next) reset();
  };

  // Each check gets a fresh request key; retrying the same import reuses it, so it never applies twice.
  const check = async (text: string) => {
    setError(null);
    setPreview(null);
    setFilter("all");
    setRequestKey(crypto.randomUUID());
    setStage("checking");
    try {
      const res = await previewRosterImportAction(text);
      if (res.success) {
        setPreview(res.preview);
        setStage("review");
      } else {
        setError(res.error);
        setStage("upload");
      }
    } catch {
      setError("The connection was interrupted. Please try again.");
      setStage("upload");
    }
  };

  const handleFile = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) return setError("Please select a valid CSV (.csv) file.");
    if (file.size > 1024 * 1024) return setError("CSV file size exceeds the 1 MB limit.");
    let text: string;
    try {
      text = await file.text();
    } catch {
      return setError("Failed to read the file. Please try again.");
    }
    setCsvText(text);
    setFileName(file.name);
    await check(text);
  };

  const handleApply = async () => {
    if (!csvText || !requestKey) return;
    setError(null);
    setStage("importing");
    try {
      const res = await applyRosterImportAction(requestKey, csvText);
      if (res.success) {
        setResult({ message: res.message, summary: res.summary, at: new Date() });
        setStage("done");
      } else {
        setError(res.error);
        setStage("failed");
      }
    } catch {
      setError("The connection was interrupted before the server answered.");
      setStage("failed");
    }
  };

  const drag = (e: React.DragEvent, dragging?: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragging !== undefined && !busy) setIsDragging(dragging);
  };

  const issues = preview ? preview.invalid + preview.conflicts : 0;
  const rows: RosterImportRowResult[] = preview
    ? preview.rows
        .filter((r) => filter === "all" || r.status === filter)
        // Rows that need fixing come first.
        .sort((a, b) => Number(a.status === "ready") - Number(b.status === "ready") || a.row - b.row)
    : [];
  const filters: { key: Filter; label: string; count: number }[] = preview
    ? ([
        { key: "all", label: "All", count: preview.rows.length },
        { key: "ready", label: "Ready", count: preview.ready },
        { key: "conflict", label: "Conflicts", count: preview.conflicts },
        { key: "invalid", label: "Invalid", count: preview.invalid },
      ] as const).filter((f) => f.key === "all" || f.count > 0)
    : [];
  const fixFileName = `${(fileName ?? "roster").replace(/\.csv$/i, "")}-to-fix.csv`;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={!busy}
        className="max-h-[92vh] w-[calc(100%-2rem)] min-w-0 gap-5 overflow-y-auto overflow-x-hidden p-5 sm:max-w-4xl sm:p-6 lg:max-w-5xl"
      >
        <DialogHeader className="gap-4 border-b border-border/60 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileSpreadsheet className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold tracking-tight text-foreground">Import student roster</DialogTitle>
              <DialogDescription className="mt-0.5 text-xs text-muted-foreground">
                Into {semesterLabel}. Nothing is saved until every row is ready, and then all rows are saved together.
              </DialogDescription>
            </div>
          </div>
          <StepTracker current={stepOf[stage]} />
        </DialogHeader>

        {(stage === "upload" || stage === "checking") && (
          <div className="flex w-full min-w-0 flex-col gap-4">
            <div
              onDragOver={(e) => drag(e)}
              onDragEnter={(e) => drag(e, true)}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                drag(e, false);
              }}
              onDrop={(e) => {
                drag(e, false);
                if (!busy) handleFile(e.dataTransfer.files?.[0]);
              }}
              onClick={() => !busy && document.getElementById(fileInputId)?.click()}
              className={cn(
                "group relative w-full min-w-0 cursor-pointer select-none rounded-xl border-2 border-dashed p-6 transition-all",
                isDragging
                  ? "border-primary bg-primary/10 shadow-sm ring-4 ring-primary/15"
                  : "border-border/80 bg-muted/15 hover:border-primary/50 hover:bg-muted/25",
              )}
            >
              <input
                id={fileInputId}
                type="file"
                accept=".csv,text/csv"
                disabled={busy}
                onChange={(e) => {
                  handleFile(e.target.files?.[0]);
                  e.target.value = ""; // picking the same file again should re-check it
                }}
                className="sr-only"
              />
              <div className="flex w-full min-w-0 flex-col items-center gap-3 text-center">
                <div
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-xl border transition-colors",
                    isDragging ? "scale-110 border-primary bg-primary/20" : "border-border bg-card shadow-2xs",
                  )}
                >
                  <FileUp className="size-5 text-primary" />
                </div>
                <div className="w-full min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground" title={fileName ?? undefined}>
                    {stage === "checking"
                      ? `Checking ${fileName}…`
                      : isDragging
                        ? "Drop your CSV file here"
                        : "Drag & drop a roster CSV, or browse"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {stage === "checking"
                      ? "Comparing every row with existing student records."
                      : "The 8-column template format, up to 1 MB."}
                  </p>
                </div>
                {stage === "checking" ? (
                  <div className="w-full max-w-sm">
                    <ProgressBar value={0} max={1} pending={1} label="Checking file" />
                  </div>
                ) : (
                  <Button type="button" size="sm" className="h-9 gap-2 px-4 font-medium" onClick={(e) => {
                    e.stopPropagation();
                    document.getElementById(fileInputId)?.click();
                  }}>
                    <Upload className="size-4" />
                    Browse file
                  </Button>
                )}
              </div>
            </div>
            {error && <ErrorAlert message={error} />}
          </div>
        )}

        {stage === "review" && preview && (
          <div className="flex w-full min-w-0 flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 text-sm font-medium text-foreground">
                {issues === 0
                  ? `All ${plural(preview.rows.length, "row")} ready to import`
                  : `${plural(preview.rows.length, "row")} · ${preview.ready} ready · ${issues} need fixing`}
                <span className="block truncate text-xs font-normal text-muted-foreground" title={fileName ?? undefined}>{fileName}</span>
              </p>
              <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground" onClick={reset}>
                <X className="size-3.5" />
                Choose another file
              </Button>
            </div>

            <SummaryBar preview={preview} />

            {issues > 0 && (
              <div role="alert" className="flex flex-col gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3.5 text-xs text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:text-amber-300">
                <span>
                  Nothing is imported until every row is ready. Download the file to fix: ready rows come first, then the
                  rows to fix with an <strong className="font-semibold">issue</strong> column. Fix them and upload the same file.
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 gap-1.5 text-xs"
                  onClick={() => csvText && downloadCsv(fixFileName, rosterFixCsv(csvText, preview.rows))}
                >
                  <Download className="size-3.5" />
                  Download file to fix
                </Button>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div role="group" aria-label="Filter rows" className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted/40 p-1 text-xs">
                {filters.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    aria-pressed={filter === f.key}
                    onClick={() => setFilter(f.key)}
                    className={cn(
                      "rounded-md px-3 py-1 font-medium transition-colors",
                      filter === f.key ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {f.label} ({f.count})
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Showing {rows.length} of {preview.rows.length}
              </p>
            </div>

            <div className="max-h-80 w-full min-w-0 overflow-auto rounded-xl border border-border bg-card/40">
              <table className="w-full min-w-[680px] text-left text-xs">
                <thead className="sticky top-0 z-10 border-b border-border bg-muted/90 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-xs">
                  <tr>
                    <th scope="col" className="w-14 px-3.5 py-2.5 text-center">Line</th>
                    <th scope="col" className="w-32 px-3.5 py-2.5">Student number</th>
                    <th scope="col" className="min-w-[140px] px-3.5 py-2.5">Name</th>
                    <th scope="col" className="w-32 px-3.5 py-2.5">Action</th>
                    <th scope="col" className="w-28 px-3.5 py-2.5">Status</th>
                    <th scope="col" className="min-w-[200px] px-3.5 py-2.5">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => {
                    const action = actionConfig[r.action] ?? actionConfig.none;
                    const ActionIcon = action.icon;
                    return (
                      <tr
                        key={r.row}
                        className={cn(
                          "transition-colors hover:bg-muted/40",
                          r.status === "invalid" && "bg-destructive/5 hover:bg-destructive/10",
                          r.status === "conflict" && "bg-amber-500/5 hover:bg-amber-500/10",
                        )}
                      >
                        <td className="w-14 px-3.5 py-2.5 text-center font-mono text-muted-foreground">{r.row}</td>
                        <td className="w-32 px-3.5 py-2.5 font-mono font-medium text-foreground">{r.university_id}</td>
                        <td className="min-w-[140px] truncate px-3.5 py-2.5 font-medium text-foreground">{r.name}</td>
                        <td className="w-32 px-3.5 py-2.5">
                          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <ActionIcon className="size-3.5 shrink-0 text-primary" />
                            {action.label}
                          </span>
                        </td>
                        <td className="w-28 px-3.5 py-2.5">
                          <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", statusStyles[r.status])}>
                            {r.status}
                          </span>
                        </td>
                        <td className="min-w-[200px] px-3.5 py-2.5 leading-relaxed text-muted-foreground">
                          <Findings message={r.message} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {stage === "importing" && preview && (
          <div className="flex flex-col gap-3 py-8">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium text-foreground">Importing {plural(preview.ready, "student")}…</span>
              <span className="text-xs text-muted-foreground">All or nothing</span>
            </div>
            <ProgressBar value={0} max={preview.ready} pending={preview.ready} label="Importing students" />
            <p className="text-xs text-muted-foreground">Keep this window open. Every row is saved in one step, so a failure leaves the roster unchanged.</p>
          </div>
        )}

        {stage === "failed" && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <XCircle className="size-10 text-destructive" />
            <h3 className="font-heading text-lg font-semibold text-foreground">Nothing was imported</h3>
            <p className="max-w-md text-sm text-muted-foreground">{error}</p>
            <p className="max-w-md text-xs text-muted-foreground">
              The roster may have changed since your check. Check the file again to see its current state.
            </p>
          </div>
        )}

        {stage === "done" && result && (
          <div className="flex flex-col gap-5 py-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="size-9 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="min-w-0">
                <h3 className="font-heading text-lg font-semibold text-foreground">{plural(result.summary.total, "student")} imported</h3>
                <p className="text-xs text-muted-foreground">{result.message}</p>
              </div>
            </div>
            <ProgressBar value={1} max={1} label="Import complete" tone="success" />
            <dl className="grid grid-cols-3 gap-3 text-center">
              {[
                ["New", result.summary.created],
                ["Re-enrolled", result.summary.re_enrolled],
                ["Updated", result.summary.updated],
              ].map(([label, n]) => (
                <div key={label} className="rounded-xl border border-border bg-card/60 p-3">
                  <dt className="text-[11px] text-muted-foreground">{label}</dt>
                  <dd className="font-heading text-xl font-semibold tabular-nums text-foreground">{n}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-muted-foreground">
              {semesterLabel} · {manilaTime.format(result.at)} · {fileName}
            </p>
          </div>
        )}

        <DialogFooter className="-mx-5 -mb-5 mt-2 flex flex-col-reverse gap-2.5 rounded-b-xl border-t border-border bg-muted/30 px-5 py-3.5 sm:-mx-6 sm:-mb-6 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-6 sm:py-4">
          {stage === "done" ? (
            <>
              <Button type="button" variant="outline" className="h-9 w-full font-medium sm:w-auto" onClick={reset}>
                Import another file
              </Button>
              {inviteCount > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 w-full gap-2 font-medium sm:w-auto"
                  onClick={() => {
                    handleOpenChange(false);
                    onInvite();
                  }}
                >
                  <Send className="size-4 text-primary" />
                  Invite {plural(inviteCount, "uninvited student")}
                </Button>
              )}
              <Button type="button" className="h-9 w-full font-medium sm:w-auto sm:min-w-28" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" disabled={busy} className="h-9 w-full font-medium sm:w-auto sm:min-w-28" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              {stage === "failed" ? (
                <Button type="button" className="h-9 w-full gap-2 font-medium sm:w-auto" onClick={() => csvText && check(csvText)}>
                  <RefreshCw className="size-4" />
                  Check file again
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={stage !== "review" || issues > 0}
                  className="h-9 w-full font-medium sm:w-auto sm:min-w-32"
                  onClick={handleApply}
                >
                  {stage === "importing"
                    ? "Importing…"
                    : stage === "review" && issues > 0
                      ? `Fix ${plural(issues, "row")} to continue`
                      : stage === "review" && preview
                        ? `Import ${plural(preview.ready, "student")}`
                        : "Import"}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Findings are stored "; "-joined (the download's issue column keeps that); several show as a list. */
function Findings({ message }: { message: string }) {
  const items = message.split("; ").filter(Boolean);
  if (items.length < 2) return <>{message}</>;
  return (
    <ul className="list-disc space-y-0.5 pl-4">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1 text-xs font-medium leading-relaxed sm:text-sm">{message}</div>
    </div>
  );
}
