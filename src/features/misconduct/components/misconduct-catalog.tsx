"use client";

import { Pencil, Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmCommandDialog, Footer, Shell } from "@/features/access/components/account-dialogs";
import { Field, ResultMessage } from "@/features/access/components/provisioning-ui";
import { useProvisioningCommand } from "@/features/access/components/use-provisioning-command";

import { archiveMisconductOptionAction, saveMisconductOptionAction } from "../actions";
import type { MisconductOption } from "../queries";
import type { SaveMisconductOptionInput } from "../schemas";

const date = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" });

type Open = { kind: "add" } | { kind: "edit" | "archive"; option: MisconductOption };

/** FL-048: add, rename and archive options. Other is always available and fixed. */
export function MisconductCatalog({ options }: { options: MisconductOption[] }) {
  const [open, setOpen] = useState<Open | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const close = () => setOpen(null);
  const active = options.filter((o) => !o.archived_at);
  const archived = options.filter((o) => o.archived_at);
  const list = showArchived ? archived : active;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" className="size-4" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived ({archived.length})
        </label>
        <Button className="gap-1.5" onClick={() => setOpen({ kind: "add" })}><Plus className="size-4" /> Add option</Button>
      </div>

      {list.length === 0 ? (
        <p className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
          {showArchived ? "No archived options." : "No active options."}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {list.map((o) => (
            <li key={o.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="font-medium break-words text-foreground">{o.label}</p>
                {o.is_other ? (
                  <p className="text-xs text-muted-foreground">Always available. Instructors must describe the misconduct when they choose it.</p>
                ) : o.archived_at ? (
                  <p className="text-xs text-muted-foreground">Archived {date.format(new Date(o.archived_at))}</p>
                ) : null}
              </div>
              {o.is_other ? (
                <span className="w-fit shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">Always available</span>
              ) : !o.archived_at && (
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen({ kind: "edit", option: o })}>
                    <Pencil className="size-3.5" /> Edit
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setOpen({ kind: "archive", option: o })}>Archive</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {open?.kind === "add" && <OptionDialog onClose={close} />}
      {open?.kind === "edit" && <OptionDialog option={open.option} onClose={close} />}
      {open?.kind === "archive" && (
        <ConfirmCommandDialog onClose={close} confirmLabel="Archive option" destructive
          title={`Archive “${open.option.label}”?`}
          description="Instructors can no longer choose it for new demerits. Demerits already recorded with it keep their wording. Archived options can't be restored here."
          onConfirm={(requestKey) => archiveMisconductOptionAction({ requestKey, optionId: open.option.id })} />
      )}
    </div>
  );
}

function OptionDialog({ option, onClose }: { option?: MisconductOption; onClose: () => void }) {
  const [label, setLabel] = useState(option?.label ?? "");
  const { run, result, isPending } = useProvisioningCommand((input: SaveMisconductOptionInput) => saveMisconductOptionAction(input));
  return (
    <Shell title={option ? "Edit option" : "Add option"} onClose={onClose} pending={isPending}
      description="Each option counts as one demerit per unit the instructor records. Renaming doesn't change demerits already recorded.">
      <ResultMessage result={result} />
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); run({ optionId: option?.id ?? null, label }); }}>
        <Field label="Misconduct">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={200} disabled={isPending || !!result?.success} />
        </Field>
        <Footer result={result} pending={isPending} onClose={onClose} submitLabel={option ? "Save option" : "Add option"} />
      </form>
    </Shell>
  );
}
