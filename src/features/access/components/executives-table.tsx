"use client";

import { useState } from "react";

import { removeExecutiveAction } from "../provisioning-actions";
import type { ProvisioningAccount } from "../provisioning-contracts";
import { ConfirmCommandDialog, ReplaceExecutiveDialog } from "./account-dialogs";
import { AccountsTable } from "./accounts-table";
import { GrantCouncilAccessDialog } from "./grant-council-access-dialog";
import { StatusBadge, displayName, sortName } from "./provisioning-ui";

type Open = { kind: "replace" | "remove"; account: ProvisioningAccount };

export function ExecutivesTable({ accounts }: { accounts: ProvisioningAccount[] }) {
  const [open, setOpen] = useState<Open | null>(null);
  const close = () => setOpen(null);
  const a = open?.account;

  return (
    <>
      <AccountsTable
        accounts={accounts}
        filterLabel="Filter by name, number or position"
        emptyText="No students currently hold Executive access."
        toolbar={<GrantCouncilAccessDialog roles={["executive"]} takenPositions={accounts.flatMap((row) => row.position_label ? [row.position_label] : [])} />}
        columns={[
          { header: "Name", cell: (row) => <span className="font-medium text-foreground">{sortName(row)}</span> },
          { header: "University number", cell: (row) => row.university_id },
          { header: "Position", cell: (row) => row.position_label },
          { header: "Account", cell: (row) => <StatusBadge account={row} /> },
        ]}
        actions={(account) => [
          { label: "Replace with Operations or Representative", onSelect: () => setOpen({ kind: "replace", account }) },
          "separator",
          { label: "Remove Executive access", onSelect: () => setOpen({ kind: "remove", account }), destructive: true },
        ]}
      />
      {open?.kind === "replace" && <ReplaceExecutiveDialog account={open.account} onClose={close} />}
      {open?.kind === "remove" && a && (
        <ConfirmCommandDialog onClose={close} confirmLabel="Remove access" destructive
          title="Remove Executive access?"
          description={`${displayName(a)} keeps their Student account and history. No other Council access is granted in its place.`}
          onConfirm={(requestKey) => removeExecutiveAction({ requestKey, profileId: a.id })} />
      )}
    </>
  );
}
