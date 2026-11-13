"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CSV_TEMPLATE_CONTENT } from "../csv";

export { CSV_TEMPLATE_CONTENT };

export function downloadRosterTemplate() {
  const blob = new Blob([CSV_TEMPLATE_CONTENT], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", "roster_template.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function DownloadTemplateButton({ className }: { className?: string } = {}) {
  return (
    <Button
      variant="outline"
      onClick={downloadRosterTemplate}
      className={cn("gap-2 font-medium whitespace-nowrap", className)}
      title="Download pre-formatted 8-header CSV roster template"
    >
      <Download className="size-4 shrink-0" />
      <span>Download CSV Template</span>
    </Button>
  );
}
