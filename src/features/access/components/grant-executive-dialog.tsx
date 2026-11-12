"use client";

import { Loader2, ShieldPlus } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { grantExecutiveAction, lookupExecutiveCandidateAction } from "../provisioning-actions";
import type { ExecutiveCandidate } from "../provisioning-contracts";
import { grantExecutiveSchema } from "../provisioning-schemas";
import { Field, ResultMessage, displayName } from "./provisioning-ui";
import { useProvisioningCommand } from "./use-provisioning-command";

const normalize = (label: string) => label.trim().toLowerCase();
const accessName = { executive: "Executive", operations: "Operations", representative: "Representative" } as const;

/** Why this student can't be granted, if anything; the database re-checks all of it. */
function blocker(candidate: ExecutiveCandidate) {
  if (candidate.account_status !== "active") return "This student's account is archived, so it can't receive Executive access.";
  if (candidate.council_role === "executive") return `This student already has Executive access (${candidate.position_label}).`;
  return null;
}

/**
 * Step 1: university number and position. Step 2: confirm the student found by
 * that exact number. takenPositions only gives early feedback; the database
 * enforces unique current Executive positions.
 */
export function GrantExecutiveDialog({ takenPositions }: { takenPositions: string[] }) {
  const [open, setOpen] = useState(false);
  const [universityId, setUniversityId] = useState("");
  const [label, setLabel] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<ExecutiveCandidate | null>(null);
  const [isSearching, startSearch] = useTransition();
  const grant = useProvisioningCommand(grantExecutiveAction);
  const busy = isSearching || grant.isPending;

  const close = () => {
    setOpen(false); setUniversityId(""); setLabel(""); setLookupError(null); setCandidate(null); grant.reset();
  };
  const positionTaken = takenPositions.some((taken) => normalize(taken) === normalize(label));

  function search(event: React.FormEvent) {
    event.preventDefault();
    setLookupError(null);
    const parsed = grantExecutiveSchema.pick({ universityId: true, label: true }).safeParse({ universityId, label });
    if (!parsed.success) { setLookupError(parsed.error.issues[0]?.message ?? "Check the form."); return; }
    if (positionTaken) { setLookupError(`Another current Executive already holds the position “${label.trim()}”.`); return; }
    startSearch(async () => {
      const result = await lookupExecutiveCandidateAction(parsed.data.universityId);
      if (result.found) setCandidate(result.candidate);
      else setLookupError(result.error ?? `No enrolled student has the university number ${parsed.data.universityId}.`);
    });
  }

  const problem = candidate && blocker(candidate);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (busy) return; if (next) setOpen(true); else close(); }}>
      <DialogTrigger render={<Button className="w-full gap-2 sm:w-auto"><ShieldPlus className="size-4" />Grant Executive access</Button>} />
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-md">
        {!candidate ? (
          <>
            <DialogHeader>
              <DialogTitle>Grant Executive access</DialogTitle>
              <DialogDescription>Enter the student’s exact university number. You’ll confirm who they are before anything changes.</DialogDescription>
            </DialogHeader>
            {lookupError && <ResultMessage result={{ success: false, error: lookupError }} />}
            <form className="flex flex-col gap-4" onSubmit={search}>
              <Field label="University number" hint="For example 21-1-00001.">
                <Input value={universityId} onChange={(e) => setUniversityId(e.target.value)} required disabled={isSearching} />
              </Field>
              <Field label="Position label" hint={positionTaken ? "Another current Executive already holds this position." : "For example President. Each current Executive needs a different position."}>
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
              <DialogDescription>Check that this is the right student before granting Executive access as “{label.trim()}”.</DialogDescription>
            </DialogHeader>
            <ResultMessage result={grant.result} />
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border border-border bg-muted/30 p-4 text-sm">
              <dt className="text-muted-foreground">University number</dt><dd className="font-medium">{candidate.university_id}</dd>
              <dt className="text-muted-foreground">Full name</dt><dd className="font-medium">{displayName(candidate)}</dd>
              <dt className="text-muted-foreground">Year level</dt><dd>Year {candidate.year_level}</dd>
              <dt className="text-muted-foreground">Academic status</dt><dd className="capitalize">{candidate.academic_status}</dd>
              <dt className="text-muted-foreground">Enrollment</dt>
              <dd>AY {candidate.enrollment_year_start}–{candidate.enrollment_year_start + 1} {candidate.enrollment_term}{candidate.enrollment_is_current ? " (current)" : " (most recent)"}</dd>
              <dt className="text-muted-foreground">Council access</dt>
              <dd>{candidate.council_role ? `${accessName[candidate.council_role]} · ${candidate.position_label}` : "None"}</dd>
            </dl>
            {problem && <ResultMessage result={{ success: false, error: problem }} />}
            {!problem && candidate.council_role && !grant.result?.success && (
              <p className="text-sm text-muted-foreground">Their current {accessName[candidate.council_role]} access will be replaced by Executive access.</p>
            )}
            <DialogFooter>
              {grant.result?.success ? <Button onClick={close}>Done</Button> : <>
                <Button variant="outline" onClick={() => { setCandidate(null); grant.reset(); }} disabled={grant.isPending}>Back</Button>
                <Button disabled={grant.isPending || !!problem} className="gap-2"
                  onClick={() => grant.run({ universityId: candidate.university_id!, label })}>
                  {grant.isPending && <Loader2 className="size-4 animate-spin" />}Grant Executive access
                </Button>
              </>}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
