"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import type { ProvisioningAccount, ProvisioningResult } from "../provisioning-contracts";
import { councilRoleNames, councilRoles, instructorRoles } from "../provisioning-schemas";

// Nullable optional parts: generated RPC types mark them non-null, roster rows don't.
type Names = { first_name: string; middle_name: string | null; last_name: string; suffix: string | null };
export const displayName = (p: Names) =>
  [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(" ") + (p.suffix ? `, ${p.suffix}` : "");
export const sortName = (p: Names) =>
  `${p.last_name}, ${[p.first_name, p.middle_name].filter(Boolean).join(" ")}${p.suffix ? `, ${p.suffix}` : ""}`;

const dateTime = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });

/** Account state for the tables; invitation usability already accounts for expires_at. */
export function accountStatus(a: ProvisioningAccount): { label: string; detail?: string; tone: "ok" | "wait" | "warn" | "muted" } {
  if (a.account_status === "archived") return { label: "Archived", tone: "muted" };
  if (a.account_linked) return { label: "Active", tone: "ok" };
  if (a.invitation_state === "pending" && a.invitation_expires_at)
    return { label: "Invited", detail: `expires ${dateTime.format(new Date(a.invitation_expires_at))}`, tone: "wait" };
  if (a.invitation_state === "expired") return { label: "Invite expired", tone: "warn" };
  if (a.invitation_state === "cancelled") return { label: "Invite cancelled", tone: "warn" };
  return { label: "Not invited", tone: "warn" };
}

const tones = {
  ok: "bg-success text-success-foreground",
  wait: "bg-secondary text-secondary-foreground",
  warn: "bg-error-surface text-foreground",
  muted: "bg-muted text-muted-foreground",
};
export function StatusBadge({ account }: { account: ProvisioningAccount }) {
  const status = accountStatus(account);
  return (
    <span className="flex flex-col gap-0.5">
      <span className={`w-fit rounded-full px-2 py-0.5 text-xs font-medium ${tones[status.tone]}`}>{status.label}</span>
      {status.detail && <span className="text-xs text-muted-foreground">{status.detail}</span>}
    </span>
  );
}

export function ResultMessage({ result }: { result: ProvisioningResult | null }) {
  if (!result) return null;
  if (result.success) return <p role="status" className="rounded-lg bg-success p-3 text-sm">{result.message}</p>;
  return (
    <div role="alert" className="rounded-lg border border-destructive/30 bg-error-surface p-3 text-sm text-foreground">
      <p>{result.error}</p>
      {result.blockers && (
        <ul className="mt-2 list-disc pl-5">
          {result.blockers.pending_endorsements.length > 0 && <li>{result.blockers.pending_endorsements.length} pending merit endorsement(s) assigned to them</li>}
          {result.blockers.open_service_sessions.length > 0 && <li>{result.blockers.open_service_sessions.length} service session(s) they created that haven’t ended</li>}
        </ul>
      )}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-medium text-foreground">
      {label}
      {children}
      {hint && <span className="font-normal text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function InstructorFields({ instructorRole, coordinator, onChange, disabled }: {
  instructorRole: (typeof instructorRoles)[number];
  coordinator: boolean;
  onChange: (next: { instructorRole: (typeof instructorRoles)[number]; coordinator: boolean }) => void;
  disabled?: boolean;
}) {
  const coordinatorLabel = instructorRole === "Academic Instructor" ? "Academic Coordinator" : "RLE Coordinator";
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span id="instructor-role-label" className="text-xs font-medium text-foreground">Instructor role</span>
        <Select value={instructorRole} disabled={disabled}
          onValueChange={(value) => onChange({ instructorRole: value as typeof instructorRole, coordinator })}>
          <SelectTrigger aria-labelledby="instructor-role-label" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {instructorRoles.map((role) => <SelectItem key={role} value={role}>{role}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4" checked={coordinator} disabled={disabled}
          onChange={(event) => onChange({ instructorRole, coordinator: event.target.checked })} />
        Also {coordinatorLabel}
      </label>
    </>
  );
}

type CouncilRole = (typeof councilRoles)[number];
export function CouncilRoleSelect({ id, label, value, onChange, disabled }: {
  id: string; label: string; value: CouncilRole; onChange: (role: CouncilRole) => void; disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className="text-xs font-medium text-foreground">{label}</span>
      <Select value={value} disabled={disabled} onValueChange={(next) => onChange(next as CouncilRole)}>
        <SelectTrigger aria-labelledby={id} className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          {councilRoles.map((role) => <SelectItem key={role} value={role}>{councilRoleNames[role]}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
