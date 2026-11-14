"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Download, FileSpreadsheet, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { getInvitationEligibilitySummary, type StudentRosterItem } from "../contracts";
import { BulkInviteDialog } from "./bulk-invite-dialog";
import { downloadRosterTemplate } from "./download-csv";
import { ImportRosterDialog } from "./import-roster-dialog";

export function RosterCsvMenu({
  canEdit = true,
  className,
  semesterId,
  semesterLabel,
  students,
}: {
  canEdit?: boolean;
  className?: string;
  semesterId: string;
  semesterLabel: string;
  students: StudentRosterItem[];
}) {
  const [importOpen, setImportOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  // The import revalidates /council, so this reflects the roster after the import.
  const inviteCount = useMemo(() => getInvitationEligibilitySummary(students).eligibleCount, [students]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              className={cn("gap-2 font-medium whitespace-nowrap", className)}
              title="Roster CSV Actions"
            >
              <FileSpreadsheet className="size-4 shrink-0 text-primary" />
              <span>Import Roster</span>
              <ChevronDown className="size-3.5 shrink-0 opacity-60" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-56 p-1.5">
          <DropdownMenuItem
            onClick={() => setImportOpen(true)}
            disabled={!canEdit}
            className="cursor-pointer gap-2.5 py-2"
          >
            <Upload className="size-4 shrink-0 text-primary" />
            <div className="flex flex-col text-left">
              <span className="font-medium text-foreground text-xs sm:text-sm">Import Roster CSV</span>
              <span className="text-[11px] text-muted-foreground">Upload & preview student batch</span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={downloadRosterTemplate}
            className="cursor-pointer gap-2.5 py-2"
          >
            <Download className="size-4 shrink-0 text-muted-foreground" />
            <div className="flex flex-col text-left">
              <span className="font-medium text-foreground text-xs sm:text-sm">Download CSV Template</span>
              <span className="text-[11px] text-muted-foreground">8-column format template</span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ImportRosterDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        semesterLabel={semesterLabel}
        inviteCount={inviteCount}
        onInvite={() => setInviteOpen(true)}
      />
      <BulkInviteDialog semesterId={semesterId} students={students} open={inviteOpen} onOpenChange={setInviteOpen} />
    </>
  );
}
