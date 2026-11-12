"use client";

import { useState, useTransition } from "react";
import { Download, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { importAttendance, previewAttendanceImport, type AttendanceImportPreview } from "../actions";
import { ATTENDANCE_CSV_HEADERS, ATTENDANCE_CSV_TEMPLATE } from "../attendance-import";

const statusStyles = {
  ready: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  skipped: "bg-muted text-muted-foreground",
  invalid: "bg-destructive/10 text-destructive",
};

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([ATTENDANCE_CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "event_attendance_template.csv";
  link.click();
  URL.revokeObjectURL(url);
}

/** Paper-fallback import: preview every row, then apply all-or-nothing. */
export function AttendanceImportDialog({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const [csv, setCsv] = useState<string | null>(null);
  const [preview, setPreview] = useState<AttendanceImportPreview | null>(null);
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleFile(file: File | undefined) {
    setError(null);
    setPreview(null);
    if (!file) return;
    const text = await file.text();
    setCsv(text);
    setRequestKey(crypto.randomUUID()); // one key per chosen file, reused on retry
    startTransition(async () => {
      const result = await previewAttendanceImport({ eventId, csv: text });
      if (!result.success) setError(result.error);
      else setPreview(result.preview);
    });
  }

  function handleImport() {
    if (!csv || !requestKey) return;
    setError(null);
    startTransition(async () => {
      const result = await importAttendance({ eventId, csv, requestKey });
      if (!result.success) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  const canImport = preview !== null && preview.invalid === 0 && preview.ready > 0;

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !isPending) onClose(); }}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import paper attendance</DialogTitle>
          <DialogDescription>
            Upload a CSV with the headers <code>{ATTENDANCE_CSV_HEADERS.join(",")}</code>. Write
            times like 08:05 or 8:05 AM; they are read as Philippine time on the event date. Times already recorded
            online are kept, and the CSV value for them is ignored.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex-1 text-sm">
            <span className="sr-only">Attendance CSV file</span>
            <input type="file" accept=".csv,text/csv" disabled={isPending}
              onChange={(e) => handleFile(e.target.files?.[0])}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-sm" />
          </label>
          <Button type="button" variant="outline" onClick={downloadTemplate} className="gap-2">
            <Download className="size-4" /> Template
          </Button>
        </div>

        {error && (
          <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}
        {isPending && !preview && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Checking file…</p>
        )}

        {preview && (
          <>
            <p className="text-sm text-foreground" role="status">
              {preview.ready} ready · {preview.skipped} skipped · {preview.invalid} invalid
              {preview.invalid > 0 && " — fix the invalid rows in the file and choose it again."}
            </p>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-2">Line</th>
                    <th scope="col" className="px-4 py-2">Student</th>
                    <th scope="col" className="px-4 py-2">Status</th>
                    <th scope="col" className="px-4 py-2">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.rows.map((row) => (
                    <tr key={row.row}>
                      <td className="px-4 py-2 text-muted-foreground">{row.row}</td>
                      <td className="px-4 py-2">
                        <p className="font-mono text-xs">{row.university_id || "—"}</p>
                        {row.name && <p className="text-xs text-muted-foreground">{row.name}</p>}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`rounded-md px-2 py-0.5 text-xs font-medium capitalize ${statusStyles[row.status]}`}>{row.status}</span>
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {row.message && (
                          <ul className={row.status === "invalid" ? "list-disc space-y-0.5 pl-4" : ""}>
                            {row.message.split("; ").map((note) => <li key={note}>{note}</li>)}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button type="button" onClick={handleImport} disabled={isPending || !canImport}>
            {isPending && preview && <Loader2 className="size-4 animate-spin" />}
            Import {preview?.ready ?? 0} row{preview?.ready === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
