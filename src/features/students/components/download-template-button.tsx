"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CSV_TEMPLATE_CONTENT = `university_id,last_name,first_name,middle_name,suffix,email,year_level,academic_status
26-1-00123,Dela Cruz,Juan Carlos,Santos,Jr.,juancarlos.delacruz@university.edu.ph,1,regular
26-1-00124,Reyes,Maria Teresa,Aquino,,mariateresa.reyes@university.edu.ph,2,irregular
`;

export function DownloadTemplateButton({ className }: { className?: string } = {}) {
  const handleDownload = () => {
    const blob = new Blob([CSV_TEMPLATE_CONTENT], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "roster_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Button
      variant="outline"
      onClick={handleDownload}
      className={cn("gap-2 font-medium whitespace-nowrap", className)}
      title="Download pre-formatted 8-header CSV roster template"
    >
      <Download className="size-4 shrink-0" />
      <span>Download CSV Template</span>
    </Button>
  );
}
