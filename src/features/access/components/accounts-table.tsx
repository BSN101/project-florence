"use client";

import { MoreHorizontal, Search } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

import type { ProvisioningAccount } from "../provisioning-contracts";

export type RowAction = { label: string; onSelect: () => void; destructive?: boolean } | "separator";

/** Shared table frame: filter box, optional toolbar, and an actions menu per row. */
export function AccountsTable({ accounts, columns, actions, toolbar, emptyText, filterLabel }: {
  accounts: ProvisioningAccount[];
  columns: { header: string; cell: (account: ProvisioningAccount) => React.ReactNode; className?: string }[];
  actions: (account: ProvisioningAccount) => RowAction[];
  toolbar?: React.ReactNode;
  emptyText: string;
  filterLabel: string;
}) {
  const [filter, setFilter] = useState("");
  const needle = filter.trim().toLowerCase();
  const rows = needle
    ? accounts.filter((a) => [a.first_name, a.middle_name, a.last_name, a.email, a.university_id, a.position_label]
      .some((value) => value?.toLowerCase().includes(needle)))
    : accounts;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label={filterLabel} placeholder={filterLabel} value={filter} onChange={(e) => setFilter(e.target.value)} className="pl-8" />
        </div>
        {toolbar && <div className="flex flex-col gap-2 sm:flex-row sm:items-center">{toolbar}</div>}
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <tr>
              {columns.map((column) => <th key={column.header} scope="col" className="px-4 py-2.5 font-medium">{column.header}</th>)}
              <th scope="col" className="w-12 px-4 py-2.5"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr><td colSpan={columns.length + 1} className="px-4 py-8 text-center text-muted-foreground">{needle ? "No matches." : emptyText}</td></tr>
            )}
            {rows.map((account) => {
              const rowActions = actions(account);
              return (
                <tr key={account.id} className={account.account_status === "archived" ? "text-muted-foreground" : undefined}>
                  {columns.map((column) => <td key={column.header} className={`px-4 py-3 align-top ${column.className ?? ""}`}>{column.cell(account)}</td>)}
                  <td className="px-2 py-2 text-right align-top">
                    {rowActions.length > 0 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Actions" />}>
                          <MoreHorizontal />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-48">
                          {rowActions.map((action, index) => action === "separator"
                            ? <DropdownMenuSeparator key={`separator-${index}`} />
                            : <DropdownMenuItem key={action.label} onClick={action.onSelect}
                                className={action.destructive ? "text-destructive" : undefined}>{action.label}</DropdownMenuItem>)}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
