"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import {
  archiveFacultyAction, archivePreviewAction, changeFacultyAssignmentsAction, replaceExecutiveAction,
  updateFacultyIdentityAction,
} from "../provisioning-actions";
import type { ArchiveBlockers, ProvisioningAccount, ProvisioningResult } from "../provisioning-contracts";
import { coordinatorFor, instructorRoles } from "../provisioning-schemas";
import { Field, InstructorFields, ResultMessage, displayName } from "./provisioning-ui";
import { useProvisioningCommand } from "./use-provisioning-command";

type DialogProps = { account: ProvisioningAccount; onClose: () => void };

function Shell({ title, description, onClose, pending, destructive, children }: {
  title: string; description: string; onClose: () => void; pending: boolean; destructive?: boolean; children: React.ReactNode;
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className={destructive ? "flex items-center gap-2 text-destructive" : undefined}>
            {destructive && <AlertTriangle className="size-5 shrink-0" />}{title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** Shows the outcome; after a success the only option left is closing. */
function Footer({ result, pending, onClose, submitLabel, destructive, onSubmit }: {
  result: ProvisioningResult | null; pending: boolean; onClose: () => void; submitLabel: string;
  destructive?: boolean; onSubmit?: () => void;
}) {
  if (result?.success) return <DialogFooter><Button onClick={onClose}>Done</Button></DialogFooter>;
  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
      <Button type={onSubmit ? "button" : "submit"} onClick={onSubmit} variant={destructive ? "destructive" : "default"} disabled={pending} className="gap-2">
        {pending && <Loader2 className="size-4 animate-spin" />}{submitLabel}
      </Button>
    </DialogFooter>
  );
}

export function EditFacultyDialog({ account, onClose }: DialogProps) {
  const [form, setForm] = useState({
    firstName: account.first_name, middleName: account.middle_name ?? "", lastName: account.last_name,
    suffix: account.suffix ?? "", email: account.email ?? "",
  });
  const { run, result, isPending } = useProvisioningCommand(updateFacultyIdentityAction);
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value });
  return (
    <Shell title="Edit details" description={displayName(account)} onClose={onClose} pending={isPending}>
      <ResultMessage result={result} />
      <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); run({ profileId: account.id, ...form }); }}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="First name"><Input value={form.firstName} onChange={set("firstName")} required maxLength={100} /></Field>
          <Field label="Middle name (optional)"><Input value={form.middleName} onChange={set("middleName")} maxLength={100} /></Field>
          <Field label="Last name"><Input value={form.lastName} onChange={set("lastName")} required maxLength={100} /></Field>
          <Field label="Suffix (optional)"><Input value={form.suffix} onChange={set("suffix")} maxLength={100} /></Field>
        </div>
        <Field label="Email" hint={account.account_linked
          ? "They've already set up their account, so the sign-in email can't be changed here."
          : "Changing the email cancels the current invitation; reissue it afterwards."}>
          <Input type="email" value={form.email} onChange={set("email")} required maxLength={254} disabled={account.account_linked} />
        </Field>
        <Footer result={result} pending={isPending} onClose={onClose} submitLabel="Save details" />
      </form>
    </Shell>
  );
}

export function ChangeAccessDialog({ account, onClose }: DialogProps) {
  const current = instructorRoles.find((role) => account.roles.includes(role)) ?? "Academic Instructor";
  const [access, setAccess] = useState({ instructorRole: current, coordinator: account.roles.includes(coordinatorFor[current]) });
  const { run, result, isPending } = useProvisioningCommand(changeFacultyAssignmentsAction);
  return (
    <Shell title="Change access" description="One instructor role, optionally with its matching coordinator role. Switching instructor type also switches the coordinator." onClose={onClose} pending={isPending}>
      <ResultMessage result={result} />
      <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); run({ profileId: account.id, ...access }); }}>
        <InstructorFields {...access} onChange={setAccess} disabled={isPending || !!result?.success} />
        <Footer result={result} pending={isPending} onClose={onClose} submitLabel="Save access" />
      </form>
    </Shell>
  );
}

/** One-click commands (remove coordinator, reissue, cancel, remove Executive) share this confirmation. */
export function ConfirmCommandDialog({ title, description, confirmLabel, destructive, onConfirm, onClose }: {
  title: string; description: string; confirmLabel: string; destructive?: boolean; onClose: () => void;
  onConfirm: (requestKey: string) => Promise<ProvisioningResult>;
}) {
  const { run, result, isPending } = useProvisioningCommand(({ requestKey }: { requestKey: string }) => onConfirm(requestKey));
  return (
    <Shell title={title} description={description} onClose={onClose} pending={isPending} destructive={destructive}>
      <ResultMessage result={result} />
      <Footer result={result} pending={isPending} onClose={onClose} submitLabel={confirmLabel} destructive={destructive} onSubmit={() => run({})} />
    </Shell>
  );
}

export function ArchiveFacultyDialog({ account, onClose }: DialogProps) {
  const [preview, setPreview] = useState<ArchiveBlockers | null | "loading">("loading");
  const { run, result, isPending } = useProvisioningCommand(archiveFacultyAction);
  useEffect(() => {
    let active = true;
    archivePreviewAction(account.id).then((value) => { if (active) setPreview(value); });
    return () => { active = false; };
  }, [account.id]);
  const blockers = preview !== "loading" && preview ? preview : null;
  const blocked = !!blockers && (blockers.pending_endorsements.length > 0 || blockers.open_service_sessions.length > 0);

  return (
    <Shell title={`Archive ${displayName(account)}?`} destructive onClose={onClose} pending={isPending}
      description="They lose all Florence access immediately. Their instructor and coordinator roles are closed and any pending invitation is cancelled. The profile and its history are kept; archived accounts can't be restored here.">
      <ResultMessage result={result} />
      {preview === "loading" && <p role="status" className="text-sm text-muted-foreground">Checking for pending work…</p>}
      {preview === null && <p role="alert" className="text-sm">We couldn’t check for pending work. You can still try; the archive is refused if anything is pending.</p>}
      {blocked && <ResultMessage result={{ success: false, error: "Archiving is blocked until this pending work is resolved:", blockers }} />}
      {!!blockers?.unwaived_issued_demerits && (
        <p className="rounded-lg border border-border bg-muted/50 p-3 text-sm">
          {blockers.unwaived_issued_demerits} unwaived demerit(s) they issued can only be waived by them. After archiving, those demerits can no longer be waived.
        </p>
      )}
      <Footer result={result} pending={isPending || preview === "loading" || blocked} onClose={onClose}
        submitLabel="Archive account" destructive onSubmit={() => run({ profileId: account.id })} />
    </Shell>
  );
}

export function ReplaceExecutiveDialog({ account, onClose }: DialogProps) {
  const [accessRole, setAccessRole] = useState<"operations" | "representative">("operations");
  const [label, setLabel] = useState("");
  const { run, result, isPending } = useProvisioningCommand(replaceExecutiveAction);
  return (
    <Shell title="Replace Executive access" description={`${displayName(account)} keeps their Student access and account. Choose the Council access that replaces Executive.`} onClose={onClose} pending={isPending}>
      <ResultMessage result={result} />
      <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); run({ profileId: account.id, accessRole, label }); }}>
        <div className="flex flex-col gap-1.5">
          <span id="replacement-role-label" className="text-xs font-medium">Replace with</span>
          <Select value={accessRole} onValueChange={(value) => setAccessRole(value as typeof accessRole)}>
            <SelectTrigger aria-labelledby="replacement-role-label" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="operations">Operations</SelectItem>
              <SelectItem value="representative">Representative</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Field label="New position label" hint="Descriptive only, for example Treasurer.">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={100} />
        </Field>
        <Footer result={result} pending={isPending} onClose={onClose} submitLabel="Replace access" />
      </form>
    </Shell>
  );
}
