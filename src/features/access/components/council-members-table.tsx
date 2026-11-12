"use client";

import { useState } from "react";

import { removeCouncilMemberAction } from "../council-membership-actions";
import type { CouncilMember } from "../provisioning-contracts";
import { councilRoleNames, councilRoles } from "../provisioning-schemas";
import { ChangeCouncilMemberDialog, ConfirmCommandDialog } from "./account-dialogs";
import { AccountsTable } from "./accounts-table";
import { GrantCouncilAccessDialog } from "./grant-council-access-dialog";
import { displayName, sortName } from "./provisioning-ui";

const dateFormat = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" });
type Open = { kind: "change" | "remove"; member: CouncilMember };

export function CouncilMembersTable({ members }: { members: CouncilMember[] }) {
  const [open, setOpen] = useState<Open | null>(null);
  const close = () => setOpen(null);
  const m = open?.member;

  return (
    <>
      <AccountsTable
        accounts={members.map((member) => ({ ...member, id: member.membership_id }))}
        filterLabel="Filter by name, number or position"
        emptyText="No students currently hold Council access."
        toolbar={<GrantCouncilAccessDialog roles={councilRoles} />}
        columns={[
          { header: "Name", cell: (row) => <span className="font-medium text-foreground">{sortName(row)}</span> },
          { header: "University number", cell: (row) => row.university_id },
          { header: "Access", cell: (row) => (
            <span className="flex flex-col gap-0.5">
              {councilRoleNames[row.access_role]}
              {row.access_role === "executive" && <span className="text-xs text-muted-foreground">Managed by Platform Admin</span>}
            </span>
          ) },
          { header: "Position", cell: (row) => row.position_label },
          { header: "Assigned", cell: (row) => (
            <span className="flex flex-col gap-0.5">
              {dateFormat.format(new Date(row.assigned_at))}
              {row.assigned_by_name && <span className="text-xs text-muted-foreground">by {row.assigned_by_name}</span>}
            </span>
          ) },
        ]}
        // Executive rows stay read-only; the database refuses them regardless.
        actions={(member) => member.access_role === "executive" ? [] : [
          { label: "Change access or position", onSelect: () => setOpen({ kind: "change", member }) },
          "separator",
          { label: "Remove Council access", onSelect: () => setOpen({ kind: "remove", member }), destructive: true },
        ]}
      />
      {open?.kind === "change" && <ChangeCouncilMemberDialog member={open.member} onClose={close} />}
      {open?.kind === "remove" && m && (
        <ConfirmCommandDialog onClose={close} confirmLabel="Remove access" destructive
          title="Remove Council access?"
          description={`${displayName(m)} keeps their Student account and history, and is notified in Florence.`}
          onConfirm={(requestKey) => removeCouncilMemberAction({ requestKey, membershipId: m.membership_id })} />
      )}
    </>
  );
}
