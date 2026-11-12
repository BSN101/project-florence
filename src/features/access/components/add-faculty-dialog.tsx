"use client";

import { Loader2, UserPlus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { provisionFacultyAction } from "../provisioning-actions";
import type { instructorRoles } from "../provisioning-schemas";
import { Field, InstructorFields, ResultMessage } from "./provisioning-ui";
import { useProvisioningCommand } from "./use-provisioning-command";

const empty = { firstName: "", middleName: "", lastName: "", suffix: "", email: "" };

export function AddFacultyDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [access, setAccess] = useState<{ instructorRole: (typeof instructorRoles)[number]; coordinator: boolean }>(
    { instructorRole: "Academic Instructor", coordinator: false });
  const { run, result, isPending, reset } = useProvisioningCommand(provisionFacultyAction);
  const set = (key: keyof typeof empty) => (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value });

  return (
    <Dialog open={open} onOpenChange={(next) => { if (isPending) return; setOpen(next); if (!next) { reset(); setForm(empty); } }}>
      <DialogTrigger render={<Button className="w-full gap-2 sm:w-auto"><UserPlus className="size-4" />Add Faculty</Button>} />
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Faculty</DialogTitle>
          <DialogDescription>Creates the Faculty profile and emails an invitation. They choose their own password; no temporary password is used.</DialogDescription>
        </DialogHeader>
        <ResultMessage result={result} />
        {result?.success ? (
          <DialogFooter><Button onClick={() => { setOpen(false); reset(); setForm(empty); }}>Done</Button></DialogFooter>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); run({ ...form, ...access }); }}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="First name"><Input value={form.firstName} onChange={set("firstName")} required maxLength={100} /></Field>
              <Field label="Middle name (optional)"><Input value={form.middleName} onChange={set("middleName")} maxLength={100} /></Field>
              <Field label="Last name"><Input value={form.lastName} onChange={set("lastName")} required maxLength={100} /></Field>
              <Field label="Suffix (optional)"><Input value={form.suffix} onChange={set("suffix")} maxLength={100} placeholder="e.g. Jr." /></Field>
            </div>
            <Field label="Email" hint="The invitation is sent here, and it becomes their sign-in email.">
              <Input type="email" value={form.email} onChange={set("email")} required maxLength={254} />
            </Field>
            <InstructorFields {...access} onChange={setAccess} disabled={isPending} />
            <DialogFooter>
              <Button type="submit" disabled={isPending} className="gap-2">
                {isPending && <Loader2 className="size-4 animate-spin" />}Create and send invitation
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
