"use client";

import { useId, useState, useTransition } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  FileUp,
  Loader2,
  RefreshCw,
  Upload,
  UserCheck,
  UserPlus,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { applyRosterImportAction, previewRosterImportAction } from "../actions";
import type { RosterImportPreview, RosterImportRowResult } from "../contracts";
import { FIXED_CSV_ROSTER_HEADERS } from "../schemas";

const statusStyles: Record<string, string> = {
  ready: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  conflict: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  invalid: "bg-destructive/10 text-destructive border-destructive/20",
};

const actionLabels: Record<string, { label: string; icon: typeof UserPlus }> = {
  create: { label: "New Student", icon: UserPlus },
  re_enroll: { label: "Re-enroll", icon: UserCheck },
  update: { label: "Update", icon: RefreshCw },
  none: { label: "—", icon: UserPlus },
};

export function ImportRosterDialog({ className }: { className?: string } = {}) {
  const [open, setOpen] = useState(false);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<RosterImportPreview | null>(null);
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "ready" | "issues">("all");
  const [isPending, startTransition] = useTransition();

  const fileInputId = useId();

  const resetState = () => {
    setCsvText(null);
    setFileName(null);
    setPreview(null);
    setRequestKey(null);
    setError(null);
    setSuccessResult(null);
    setFilter("all");
  };

  const handleFile = async (file: File | undefined) => {
    setError(null);
    setSuccessResult(null);
    setPreview(null);
    if (!file) return;

    if (!file.name.endsWith(".csv")) {
      setError("Please select a valid CSV (.csv) file.");
      return;
    }

    if (file.size > 1024 * 1024) {
      setError("CSV file size exceeds the 1 MB limit.");
      return;
    }

    try {
      const text = await file.text();
      setCsvText(text);
      setFileName(file.name);
      const key = crypto.randomUUID();
      setRequestKey(key);

      startTransition(async () => {
        const result = await previewRosterImportAction(text);
        if (!result.success) {
          setError(result.error);
        } else {
          setPreview(result.preview);
        }
      });
    } catch {
      setError("Failed to read the file. Please try again.");
    }
  };

  const handleApply = () => {
    if (!csvText || !requestKey) return;
    setError(null);

    startTransition(async () => {
      const result = await applyRosterImportAction(requestKey, csvText);
      if (!result.success) {
        setError(result.error);
      } else {
        setSuccessResult(result.message);
      }
    });
  };

  const canImport =
    preview !== null &&
    preview.invalid === 0 &&
    preview.conflicts === 0 &&
    preview.ready > 0 &&
    !successResult;

  const filteredRows: RosterImportRowResult[] = preview
    ? preview.rows.filter((r) => {
        if (filter === "ready") return r.status === "ready";
        if (filter === "issues") return r.status === "invalid" || r.status === "conflict";
        return true;
      })
    : [];

  const issuesCount = preview ? preview.invalid + preview.conflicts : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && isPending) return;
        setOpen(next);
        if (!next) resetState();
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="outline"
            className={cn("gap-2 font-medium whitespace-nowrap", className)}
            title="Import students via CSV file"
          >
            <Upload className="size-4 shrink-0" />
            <span>Import Roster CSV</span>
          </Button>
        }
      />

      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-5 text-primary" />
            <span>Import Student Roster CSV</span>
          </DialogTitle>
          <DialogDescription>
            Validate and apply student enrollments in the current semester. New students will be
            created and existing students re-enrolled preserving identity continuity.
          </DialogDescription>
        </DialogHeader>

        {successResult ? (
          <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-8" />
            </div>
            <div className="space-y-1.5">
              <h3 className="font-heading text-lg font-semibold text-foreground">
                Import Completed Successfully
              </h3>
              <p className="max-w-md text-sm text-muted-foreground">{successResult}</p>
            </div>
            <Button onClick={() => setOpen(false)} className="mt-2 font-medium">
              Close
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-5 py-2">
            {/* Step 1: File Upload Box */}
            <div className="rounded-xl border border-dashed border-border p-4 transition-colors hover:border-primary/50">
              <div className="flex flex-col items-center justify-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <FileUp className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {fileName ?? "Choose a CSV file to validate"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Requires 8 columns:{" "}
                      <code className="text-[11px] font-mono text-muted-foreground">
                        {FIXED_CSV_ROSTER_HEADERS.join(", ")}
                      </code>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {fileName && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={resetState}
                      disabled={isPending}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3.5 mr-1" />
                      Clear
                    </Button>
                  )}
                  <label htmlFor={fileInputId}>
                    <input
                      id={fileInputId}
                      type="file"
                      accept=".csv,text/csv"
                      disabled={isPending}
                      onChange={(e) => handleFile(e.target.files?.[0])}
                      className="sr-only"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      className="cursor-pointer gap-1.5"
                      onClick={() => document.getElementById(fileInputId)?.click()}
                    >
                      {isPending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Upload className="size-3.5" />
                      )}
                      <span>{fileName ? "Change File" : "Select CSV"}</span>
                    </Button>
                  </label>
                </div>
              </div>
            </div>

            {/* Error Message Alert */}
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
              >
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <div className="flex-1 text-xs sm:text-sm">{error}</div>
              </div>
            )}

            {/* Loading Indicator */}
            {isPending && !preview && (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-primary" />
                <span>Validating CSV structure and student records…</span>
              </div>
            )}

            {/* Step 2: Preview Summary & Conflict Table */}
            {preview && (
              <div className="flex flex-col gap-4">
                {/* Metrics Breakdown Cards */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Ready to Apply</p>
                    <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                      {preview.ready}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {preview.created} new · {preview.re_enrolled} re-enrolled
                    </p>
                  </div>

                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Updates</p>
                    <p className="text-lg font-semibold text-sky-600 dark:text-sky-400">
                      {preview.updated}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Current enrollment</p>
                  </div>

                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Conflicts</p>
                    <p
                      className={cn(
                        "text-lg font-semibold",
                        preview.conflicts > 0
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-muted-foreground",
                      )}
                    >
                      {preview.conflicts}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Name/identity mismatch</p>
                  </div>

                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Invalid Rows</p>
                    <p
                      className={cn(
                        "text-lg font-semibold",
                        preview.invalid > 0 ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {preview.invalid}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Format/missing fields</p>
                  </div>
                </div>

                {/* Validation Advice Banner */}
                {issuesCount > 0 ? (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs sm:text-sm text-amber-800 dark:text-amber-300"
                  >
                    <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                    <div>
                      Found <strong>{issuesCount} issue(s)</strong> in the file. Atomic import
                      requires all rows to be valid. Please correct the invalid/conflicting rows in
                      your CSV and re-upload before applying.
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs sm:text-sm text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="size-4 shrink-0" />
                    <div>
                      All <strong>{preview.ready} rows</strong> are valid and ready to apply
                      atomically to the current semester roster.
                    </div>
                  </div>
                )}

                {/* Table Filters */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setFilter("all")}
                      className={cn(
                        "rounded-md px-2.5 py-1 font-medium transition-colors",
                        filter === "all"
                          ? "bg-background text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      All ({preview.rows.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilter("ready")}
                      className={cn(
                        "rounded-md px-2.5 py-1 font-medium transition-colors",
                        filter === "ready"
                          ? "bg-background text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Ready ({preview.ready})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilter("issues")}
                      className={cn(
                        "rounded-md px-2.5 py-1 font-medium transition-colors",
                        filter === "issues"
                          ? "bg-background text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Issues ({issuesCount})
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Showing {filteredRows.length} of {preview.rows.length} rows
                  </p>
                </div>

                {/* Scrollable Preview Table */}
                <div className="max-h-72 overflow-x-auto overflow-y-auto rounded-xl border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 border-b border-border bg-muted text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th scope="col" className="px-3 py-2 w-12">
                          Line
                        </th>
                        <th scope="col" className="px-3 py-2">
                          Student Number
                        </th>
                        <th scope="col" className="px-3 py-2">
                          Name
                        </th>
                        <th scope="col" className="px-3 py-2">
                          Action
                        </th>
                        <th scope="col" className="px-3 py-2">
                          Status
                        </th>
                        <th scope="col" className="px-3 py-2">
                          Details
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                            No rows matching the selected filter.
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map((r) => {
                          const actionConfig = actionLabels[r.action] ?? actionLabels.none;
                          const ActionIcon = actionConfig.icon;
                          return (
                            <tr
                              key={r.row}
                              className={cn(
                                "transition-colors hover:bg-muted/30",
                                r.status === "invalid" && "bg-destructive/5",
                                r.status === "conflict" && "bg-amber-500/5",
                              )}
                            >
                              <td className="px-3 py-2 font-mono text-muted-foreground">{r.row}</td>
                              <td className="px-3 py-2 font-mono font-medium text-foreground">
                                {r.university_id}
                              </td>
                              <td className="px-3 py-2 font-medium text-foreground">{r.name}</td>
                              <td className="px-3 py-2">
                                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                  <ActionIcon className="size-3" />
                                  <span>{actionConfig.label}</span>
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                <span
                                  className={cn(
                                    "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                                    statusStyles[r.status],
                                  )}
                                >
                                  {r.status}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">
                                {r.message}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {!successResult && (
          <DialogFooter className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleApply}
              disabled={isPending || !canImport}
              className="w-full gap-2 font-medium sm:w-auto"
            >
              {isPending && <Loader2 className="size-4 animate-spin" />}
              <span>
                {preview
                  ? `Import ${preview.ready} Student${preview.ready === 1 ? "" : "s"}`
                  : "Import Roster"}
              </span>
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
