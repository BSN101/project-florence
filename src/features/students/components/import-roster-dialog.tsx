"use client";

import { useId, useState, useTransition } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Download,
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
import { downloadRosterTemplate } from "./download-template-button";

const statusStyles: Record<string, string> = {
  ready: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  conflict: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  invalid: "bg-destructive/10 text-destructive border-destructive/20",
};

const actionConfig: Record<string, { label: string; icon: typeof UserPlus }> = {
  create: { label: "New Student", icon: UserPlus },
  re_enroll: { label: "Re-enroll", icon: UserCheck },
  update: { label: "Update", icon: RefreshCw },
  none: { label: "—", icon: UserPlus },
};

type FilterType = "all" | "ready" | "conflicts" | "invalid";

export function ImportRosterDialog({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  trigger,
  className,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
  className?: string;
} = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<RosterImportPreview | null>(null);
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
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

  const handleOpenChange = (next: boolean) => {
    if (!next && isPending) return;
    if (isControlled) {
      controlledOnOpenChange?.(next);
    } else {
      setInternalOpen(next);
    }
    if (!next) resetState();
  };

  const setOpen = (next: boolean) => handleOpenChange(next);

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
        if (filter === "conflicts") return r.status === "conflict";
        if (filter === "invalid") return r.status === "invalid";
        return true;
      })
    : [];

  const issuesCount = preview ? preview.invalid + preview.conflicts : 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {!isControlled && (
        <DialogTrigger
          render={
            trigger ? (
              <>{trigger}</>
            ) : (
              <Button
                variant="outline"
                className={cn("gap-2 font-medium whitespace-nowrap", className)}
                title="Import students via CSV file"
              >
                <Upload className="size-4 shrink-0" />
                <span>Import Roster CSV</span>
              </Button>
            )
          }
        />
      )}

      <DialogContent className="max-h-[92vh] w-[calc(100%-2rem)] sm:max-w-4xl lg:max-w-5xl overflow-y-auto overflow-x-hidden min-w-0 p-5 sm:p-7 gap-6">
        <DialogHeader className="gap-1.5 pb-1 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileSpreadsheet className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold tracking-tight text-foreground">
                Import Student Roster CSV
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Validate and enroll students in the current semester. Existing student identities are preserved.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {successResult ? (
          <div className="flex flex-col items-center justify-center gap-4 py-12 text-center w-full min-w-0">
            <div className="flex size-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-9" />
            </div>
            <div className="space-y-1.5">
              <h3 className="font-heading text-xl font-semibold text-foreground">
                Import Completed Successfully
              </h3>
              <p className="max-w-md text-sm text-muted-foreground">{successResult}</p>
            </div>
            <Button onClick={() => setOpen(false)} className="mt-4 font-medium px-6">
              Done
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-6 w-full min-w-0">
            {/* Step 1: File Upload Box */}
            <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-5 transition-colors hover:border-primary/50 w-full min-w-0">
              <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-card border border-border shadow-2xs text-muted-foreground">
                    <FileUp className="size-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {fileName ?? "Choose a student roster CSV to preview"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Supports the 8-column format (<code>university_id</code>, names, email, year 1–4, status) up to 1 MB.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-end sm:self-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={downloadRosterTemplate}
                    disabled={isPending}
                    className="h-9 px-3 text-xs font-medium gap-1.5"
                    title="Download pre-formatted 8-column CSV roster template"
                  >
                    <Download className="size-3.5 text-muted-foreground" />
                    <span>Download Template</span>
                  </Button>
                  {fileName && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={resetState}
                      disabled={isPending}
                      className="text-xs text-muted-foreground hover:text-foreground h-9"
                    >
                      <X className="size-3.5 mr-1" />
                      Remove
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
                      variant={fileName ? "outline" : "default"}
                      size="sm"
                      disabled={isPending}
                      className="cursor-pointer gap-2 h-9 px-4 font-medium"
                      onClick={() => document.getElementById(fileInputId)?.click()}
                    >
                      {isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Upload className="size-4" />
                      )}
                      <span>{fileName ? "Change CSV" : "Select CSV File"}</span>
                    </Button>
                  </label>
                </div>
              </div>
            </div>

            {/* Error Message Alert */}
            {error && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive"
              >
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <div className="flex-1 text-xs sm:text-sm font-medium leading-relaxed">{error}</div>
              </div>
            )}

            {/* Loading Indicator */}
            {isPending && !preview && (
              <div className="flex flex-col items-center justify-center gap-2.5 py-10 text-muted-foreground">
                <Loader2 className="size-6 animate-spin text-primary" />
                <p className="text-sm font-medium">Validating CSV rows against student records…</p>
                <p className="text-xs text-muted-foreground">Checking duplicates, enrollment statuses, and identity continuity.</p>
              </div>
            )}

            {/* Step 2: Preview Summary & Conflict Table */}
            {preview && (
              <div className="flex flex-col gap-5">
                {/* Metrics Breakdown Cards - Spacious & Clean */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 w-full min-w-0">
                  {/* Ready Card */}
                  <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="text-xs font-medium">Ready to Apply</span>
                      <span className="flex size-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="size-3.5" />
                      </span>
                    </div>
                    <div className="mt-2.5">
                      <p className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                        {preview.ready}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 font-medium">
                          {preview.created} new
                        </span>
                        <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 font-medium">
                          {preview.re_enrolled} re-enrolled
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Updates Card */}
                  <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="text-xs font-medium">Enrollment Updates</span>
                      <span className="flex size-5 items-center justify-center rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400">
                        <RefreshCw className="size-3.5" />
                      </span>
                    </div>
                    <div className="mt-2.5">
                      <p className="text-2xl font-bold tracking-tight text-sky-600 dark:text-sky-400">
                        {preview.updated}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground truncate">
                        Already enrolled in semester
                      </p>
                    </div>
                  </div>

                  {/* Conflicts Card */}
                  <div
                    className={cn(
                      "flex flex-col justify-between rounded-xl border p-4 shadow-2xs transition-colors",
                      preview.conflicts > 0
                        ? "border-amber-500/30 bg-amber-500/5"
                        : "border-border/80 bg-card",
                    )}
                  >
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="text-xs font-medium">Identity Conflicts</span>
                      <span
                        className={cn(
                          "flex size-5 items-center justify-center rounded-full",
                          preview.conflicts > 0
                            ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        <AlertTriangle className="size-3.5" />
                      </span>
                    </div>
                    <div className="mt-2.5">
                      <p
                        className={cn(
                          "text-2xl font-bold tracking-tight",
                          preview.conflicts > 0
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-muted-foreground",
                        )}
                      >
                        {preview.conflicts}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground truncate">
                        {preview.conflicts > 0 ? "Name / email mismatch" : "No conflicts detected"}
                      </p>
                    </div>
                  </div>

                  {/* Invalid Rows Card */}
                  <div
                    className={cn(
                      "flex flex-col justify-between rounded-xl border p-4 shadow-2xs transition-colors",
                      preview.invalid > 0
                        ? "border-destructive/30 bg-destructive/5"
                        : "border-border/80 bg-card",
                    )}
                  >
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="text-xs font-medium">Invalid Rows</span>
                      <span
                        className={cn(
                          "flex size-5 items-center justify-center rounded-full",
                          preview.invalid > 0
                            ? "bg-destructive/20 text-destructive"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        <AlertCircle className="size-3.5" />
                      </span>
                    </div>
                    <div className="mt-2.5">
                      <p
                        className={cn(
                          "text-2xl font-bold tracking-tight",
                          preview.invalid > 0 ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {preview.invalid}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground truncate">
                        {preview.invalid > 0 ? "Format or missing data" : "All rows well-formed"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Validation Advice Banner */}
                {issuesCount > 0 ? (
                  <div
                    role="alert"
                    className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3.5 text-xs sm:text-sm text-amber-900 dark:text-amber-300"
                  >
                    <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                    <div>
                      Found <strong>{issuesCount} issue(s)</strong> in the file ({preview.conflicts} conflicts, {preview.invalid} invalid). Atomic import requires all rows to be valid before applying. Please fix the flagged rows in your CSV and re-upload.
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3.5 text-xs sm:text-sm text-emerald-900 dark:text-emerald-300">
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <div>
                      All <strong>{preview.ready} rows</strong> are valid and ready to apply atomically to the active semester roster.
                    </div>
                  </div>
                )}

                {/* Table Filter Tabs */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                  <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setFilter("all")}
                      className={cn(
                        "rounded-md px-3 py-1 font-medium transition-colors",
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
                        "rounded-md px-3 py-1 font-medium transition-colors",
                        filter === "ready"
                          ? "bg-background text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Ready ({preview.ready})
                    </button>
                    {preview.conflicts > 0 && (
                      <button
                        type="button"
                        onClick={() => setFilter("conflicts")}
                        className={cn(
                          "rounded-md px-3 py-1 font-medium transition-colors",
                          filter === "conflicts"
                            ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 shadow-xs"
                            : "text-amber-600 hover:text-amber-700",
                        )}
                      >
                        Conflicts ({preview.conflicts})
                      </button>
                    )}
                    {preview.invalid > 0 && (
                      <button
                        type="button"
                        onClick={() => setFilter("invalid")}
                        className={cn(
                          "rounded-md px-3 py-1 font-medium transition-colors",
                          filter === "invalid"
                            ? "bg-destructive/20 text-destructive shadow-xs"
                            : "text-destructive/80 hover:text-destructive",
                        )}
                      >
                        Invalid ({preview.invalid})
                      </button>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Showing {filteredRows.length} of {preview.rows.length} rows
                  </p>
                </div>

                {/* Scrollable Preview Table with Responsive Column Sizing */}
                <div className="w-full min-w-0 max-h-80 overflow-x-auto overflow-y-auto rounded-xl border border-border bg-card/40">
                  <table className="w-full min-w-[680px] text-left text-xs">
                    <thead className="sticky top-0 border-b border-border bg-muted/90 backdrop-blur-xs text-[11px] font-semibold uppercase tracking-wider text-muted-foreground z-10">
                      <tr>
                        <th scope="col" className="px-3.5 py-2.5 w-14 text-center">
                          Line
                        </th>
                        <th scope="col" className="px-3.5 py-2.5 w-32">
                          Student Number
                        </th>
                        <th scope="col" className="px-3.5 py-2.5 min-w-[140px]">
                          Name
                        </th>
                        <th scope="col" className="px-3.5 py-2.5 w-32">
                          Action
                        </th>
                        <th scope="col" className="px-3.5 py-2.5 w-28">
                          Status
                        </th>
                        <th scope="col" className="px-3.5 py-2.5 min-w-[200px]">
                          Details / Findings
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                            No rows found matching the selected filter.
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map((r) => {
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
                              <td className="px-3.5 py-2.5 font-mono text-center text-muted-foreground w-14">
                                {r.row}
                              </td>
                              <td className="px-3.5 py-2.5 font-mono font-medium text-foreground w-32">
                                {r.university_id}
                              </td>
                              <td className="px-3.5 py-2.5 font-medium text-foreground min-w-[140px] truncate">
                                {r.name}
                              </td>
                              <td className="px-3.5 py-2.5 w-32">
                                <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                  <ActionIcon className="size-3.5 shrink-0 text-primary" />
                                  <span>{action.label}</span>
                                </span>
                              </td>
                              <td className="px-3.5 py-2.5 w-28">
                                <span
                                  className={cn(
                                    "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                                    statusStyles[r.status],
                                  )}
                                >
                                  {r.status}
                                </span>
                              </td>
                              <td className="px-3.5 py-2.5 text-muted-foreground leading-relaxed min-w-[200px]">
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
          <DialogFooter className="mt-2 pt-3 border-t border-border/60 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3 w-full min-w-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
              className="w-full sm:w-auto font-medium"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleApply}
              disabled={isPending || !canImport}
              className="w-full gap-2 font-medium sm:w-auto px-5"
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
