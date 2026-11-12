"use client";

import { Loader2, ShieldPlus } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { addCouncilMemberAction, lookupCouncilCandidateAction } from "../council-membership-actions";
import { grantExecutiveAction, lookupExecutiveCandidateAction } from "../provisioning-actions";
import type { StudentCandidate } from "../provisioning-contracts";
import { addCouncilMemberSchema, councilRoleNames as accessName, type councilRoles } from "../provisioning-schemas";
import { CouncilRoleSelect, Field, ResultMessage, displayName } from "./provisioning-ui";
import { useProvisioningCommand } from "./use-provisioning-command";

const normalize = (label: string) => label.trim().toLowerCase();
type Role = keyof typeof accessName;
type GrantInput = { requestKey: string; universityId: string; role: Role; label: string };

/** Why this student can't be granted, if anything; the database re-checks all of it. */
function blocker(candidate: StudentCandidate, executive: boolean) {
  if (candidate.account_status !== "active") return "This student's account is archived, so it can't receive Council access.";
  if (candidate.council_role === "executive") return `This student already has Executive access (${candidate.position_label}).${executive ? "" : " Executive changes belong to Platform Admin."}`;
  if (executive) return null;
  if (!candidate.account_linked) return "This student hasn't activated their Florence account yet. Add them after they accept their invitation.";
  if (candidate.council_role) return `This student already has ${accessName[candidate.council_role]} access (${candidate.position_label}). Change it from the members list.`;
  if (!candidate.enrollment_is_current) return "This student isn't enrolled in the current semester.";
  return null;
}

// Platform Admin grants Executive; Council Executives add Operations or Representative.
const grant = ({ role, ...input }: GrantInput) =>
  role === "executive" ? grantExecutiveAction(input) : addCouncilMemberAction({ role, ...input });

/**
 * Step 1: university number, access and position. Step 2: confirm the student
 * found by that exact number. takenPositions only gives early feedback; the
 * database enforces unique current Executive positions.
 */
export function GrantCouncilAccessDialog({ roles, takenPositions = [] }: {
  roles: readonly ["executive"] | typeof councilRoles; takenPositions?: string[];
}) {
  const executive = roles[0] === "executive";
  const [open, setOpen] = useState(false);
  const [universityId, setUniversityId] = useState("");
  const [role, setRole] = useState<Role>(roles[0]);
  const [label, setLabel] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<StudentCandidate | null>(null);
  const [isSearching, startSearch] = useTransition();
  const command = useProvisioningCommand(grant);
  const busy = isSearching || command.isPending;
  const title = executive ? "Grant Executive access" : "Add Council member";

  const close = () => {
    setOpen(false); setUniversityId(""); setRole(roles[0]); setLabel(""); setLookupError(null); setCandidate(null); command.reset();
  };
  const positionTaken = executive && takenPositions.some((taken) => normalize(taken) === normalize(label));

  function search(event: React.FormEvent) {
    event.preventDefault();
    setLookupError(null);
    const parsed = addCouncilMemberSchema.pick({ universityId: true, label: true }).safeParse({ universityId, label });
    if (!parsed.success) { setLookupError(parsed.error.issues[0]?.message ?? "Check the form."); return; }
    if (positionTaken) { setLookupError(`Another current Executive already holds the position “${label.trim()}”.`); return; }
    startSearch(async () => {
      const result = await (executive ? lookupExecutiveCandidateAction : lookupCouncilCandidateAction)(parsed.data.universityId);
      if (result.found) setCandidate(result.candidate);
      else setLookupError(result.error ?? `No enrolled student has the university number ${parsed.data.universityId}.`);
    });
  }

  const problem = candidate && blocker(candidate, executive);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (busy) return; if (next) setOpen(true); else close(); }}>
      <DialogTrigger render={<Button className="w-full gap-2 sm:w-auto"><ShieldPlus className="size-4" />{title}</Button>} />
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-md">
        {!candidate ? (
          <>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>Enter the student’s exact university number. You’ll confirm who they are before anything changes.</DialogDescription>
            </DialogHeader>
            {lookupError && <ResultMessage result={{ success: false, error: lookupError }} />}
            <form className="flex flex-col gap-4" onSubmit={search}>
              <Field label="University number" hint="For example 21-1-00001.">
                <Input value={universityId} onChange={(e) => setUniversityId(e.target.value)} required disabled={isSearching} />
              </Field>
              {!executive && <CouncilRoleSelect id="grant-role" label="Access" value={role as Exclude<Role, "executive">}
                onChange={setRole} disabled={isSearching} />}
              <Field label="Position label" hint={!executive ? "For example Treasurer. Descriptive only; it doesn't change access."
                : positionTaken ? "Another current Executive already holds this position." : "For example President. Each current Executive needs a different position."}>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={100} disabled={isSearching}
                  aria-invalid={positionTaken || undefined} />
              </Field>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close} disabled={isSearching}>Cancel</Button>
                <Button type="submit" disabled={isSearching || positionTaken} className="gap-2">
                  {isSearching && <Loader2 className="size-4 animate-spin" />}{isSearching ? "Searching…" : "Find student"}
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Confirm student</DialogTitle>
              <DialogDescription>Check that this is the right student before granting {accessName[role]} access as “{label.trim()}”.</DialogDescription>
            </DialogHeader>
            <ResultMessage result={command.result} />
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border border-border bg-muted/30 p-4 text-sm">
              <dt className="text-muted-foreground">University number</dt><dd className="font-medium">{candidate.university_id}</dd>
              <dt className="text-muted-foreground">Full name</dt><dd className="font-medium">{displayName(candidate)}</dd>
              <dt className="text-muted-foreground">Year level</dt><dd>Year {candidate.year_level}</dd>
              <dt className="text-muted-foreground">Academic status</dt><dd className="capitalize">{candidate.academic_status}</dd>
              <dt className="text-muted-foreground">Enrollment</dt>
              <dd>AY {candidate.enrollment_year_start}–{candidate.enrollment_year_start + 1} {candidate.enrollment_term}{candidate.enrollment_is_current ? " (current)" : " (most recent)"}</dd>
              {!executive && <><dt className="text-muted-foreground">Florence account</dt>
                <dd>{candidate.account_linked ? "Activated" : "Not activated (roster only)"}</dd></>}
              <dt className="text-muted-foreground">Council access</dt>
              <dd>{candidate.council_role ? `${accessName[candidate.council_role]} · ${candidate.position_label}` : "None"}</dd>
            </dl>
            {problem && <ResultMessage result={{ success: false, error: problem }} />}
            {executive && !problem && candidate.council_role && !command.result?.success && (
              <p className="text-sm text-muted-foreground">Their current {accessName[candidate.council_role]} access will be replaced by Executive access.</p>
            )}
            <DialogFooter>
              {command.result?.success ? <Button onClick={close}>Done</Button> : <>
                <Button variant="outline" onClick={() => { setCandidate(null); command.reset(); }} disabled={command.isPending}>Back</Button>
                <Button disabled={command.isPending || !!problem} className="gap-2"
                  onClick={() => command.run({ universityId: candidate.university_id!, role, label })}>
                  {command.isPending && <Loader2 className="size-4 animate-spin" />}{executive ? "Grant Executive access" : `Add as ${accessName[role]}`}
                </Button>
              </>}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
