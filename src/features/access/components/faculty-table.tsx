"use client";

import { useState } from "react";

import { cancelInvitationAction, changeFacultyAssignmentsAction, reissueInvitationAction } from "../provisioning-actions";
import type { ProvisioningAccount } from "../provisioning-contracts";
import { coordinatorFor, instructorRoles } from "../provisioning-schemas";
import { ArchiveFacultyDialog, ChangeAccessDialog, ConfirmCommandDialog, EditFacultyDialog } from "./account-dialogs";
import { AccountsTable, type RowAction } from "./accounts-table";
import { AddFacultyDialog } from "./add-faculty-dialog";
import { StatusBadge, displayName, sortName } from "./provisioning-ui";

type Open = { kind: "edit" | "access" | "archive" | "removeCoordinator" | "reissue" | "cancel"; account: ProvisioningAccount };

export function FacultyTable({ accounts }: { accounts: ProvisioningAccount[] }) {
  const [open, setOpen] = useState<Open | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const visible = showArchived ? accounts : accounts.filter((a) => a.account_status !== "archived");
  const archivedCount = accounts.length - accounts.filter((a) => a.account_status !== "archived").length;
  const close = () => setOpen(null);

  function actions(account: ProvisioningAccount): RowAction[] {
    if (account.account_status === "archived") return [];
    const show = (kind: Open["kind"]) => () => setOpen({ kind, account });
    const instructor = instructorRoles.find((role) => account.roles.includes(role));
    const items: RowAction[] = [
      { label: "Edit details", onSelect: show("edit") },
      { label: "Change access", onSelect: show("access") },
    ];
    if (instructor && account.roles.includes(coordinatorFor[instructor])) {
      items.push({ label: `Remove ${coordinatorFor[instructor]}`, onSelect: show("removeCoordinator") });
    }
    if (!account.account_linked) {
      items.push("separator", { label: account.pending_invitation_id ? "Resend invitation" : "Reissue invitation", onSelect: show("reissue") });
      if (account.pending_invitation_id) items.push({ label: "Cancel invitation", onSelect: show("cancel") });
    }
    items.push("separator", { label: "Archive account", onSelect: show("archive"), destructive: true });
    return items;
  }

  const a = open?.account;
  const instructor = a && instructorRoles.find((role) => a.roles.includes(role));

  return (
    <>
      <AccountsTable
        accounts={visible}
        filterLabel="Filter by name or email"
        emptyText="No Faculty accounts yet. Use Add Faculty to create one."
        toolbar={<>
          {archivedCount > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Show archived ({archivedCount})
            </label>
          )}
          <AddFacultyDialog />
        </>}
        columns={[
          { header: "Name", cell: (row) => <span className="font-medium text-foreground">{sortName(row)}</span> },
          { header: "Email", cell: (row) => row.email ?? "—", className: "break-all" },
          { header: "Access", cell: (row) => row.roles.length ? row.roles.join(", ") : <span className="text-muted-foreground">None</span> },
          { header: "Status", cell: (row) => <StatusBadge account={row} /> },
        ]}
        actions={actions}
      />

      {open?.kind === "edit" && <EditFacultyDialog account={open.account} onClose={close} />}
      {open?.kind === "access" && <ChangeAccessDialog account={open.account} onClose={close} />}
      {open?.kind === "archive" && <ArchiveFacultyDialog account={open.account} onClose={close} />}
      {open?.kind === "removeCoordinator" && a && instructor && (
        <ConfirmCommandDialog onClose={close} confirmLabel="Remove coordinator"
          title={`Remove ${coordinatorFor[instructor]}?`}
          description={`${displayName(a)} keeps their ${instructor} role and Faculty access.`}
          onConfirm={(requestKey) => changeFacultyAssignmentsAction({ requestKey, profileId: a.id, instructorRole: instructor, coordinator: false })} />
      )}
      {open?.kind === "reissue" && a && (
        <ConfirmCommandDialog onClose={close} confirmLabel="Send invitation"
          title="Send a new invitation?"
          description={`A new link goes to ${a.email}. Any earlier link stops working.`}
          onConfirm={(requestKey) => reissueInvitationAction({ requestKey, profileId: a.id })} />
      )}
      {open?.kind === "cancel" && a?.pending_invitation_id && (
        <ConfirmCommandDialog onClose={close} confirmLabel="Cancel invitation" destructive
          title="Cancel this invitation?"
          description={`The link sent to ${a.email} stops working. The profile stays; you can reissue later.`}
          onConfirm={(requestKey) => cancelInvitationAction({ requestKey, invitationId: a.pending_invitation_id! })} />
      )}
    </>
  );
}
