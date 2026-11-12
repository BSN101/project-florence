"use client";

import { useState } from "react";
import { Plus, Edit2, Archive, CheckCircle2, History } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { FeeDefinitionCatalogItem } from "../contracts";
import { CreateFeeDialog } from "./create-fee-dialog";
import { EditFeeDialog } from "./edit-fee-dialog";
import { ArchiveFeeDialog } from "./archive-fee-dialog";

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

function formatDate(isoString: string) {
  return new Date(isoString).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}

export function FeeDefinitionList({
  definitions,
}: {
  definitions: FeeDefinitionCatalogItem[];
}) {
  const [activeTab, setActiveTab] = useState<"active" | "archived">("active");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingDefinition, setEditingDefinition] = useState<FeeDefinitionCatalogItem | null>(null);
  const [archivingDefinition, setArchivingDefinition] = useState<FeeDefinitionCatalogItem | null>(null);

  const activeFees = definitions.filter((f) => f.archived_at === null);
  const archivedFees = definitions.filter((f) => f.archived_at !== null);
  const currentList = activeTab === "active" ? activeFees : archivedFees;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Fee Definitions</h2>
          <p className="text-sm text-muted-foreground">
            Manage reusable fees published to students. Changes affect future publications only.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="w-full gap-1.5 sm:w-auto"
        >
          <Plus className="size-4" />
          New Fee Definition
        </Button>
      </div>

      <div className="flex border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab("active")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
            activeTab === "active"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <CheckCircle2 className="size-4" />
          Active Fees ({activeFees.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("archived")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
            activeTab === "archived"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <History className="size-4" />
          Archived Fees ({archivedFees.length})
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
        {currentList.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm font-medium text-muted-foreground">
              {activeTab === "active"
                ? "No active fee definitions found."
                : "No archived fee definitions found."}
            </p>
            {activeTab === "active" && (
              <p className="text-xs text-muted-foreground mt-1">
                Click &ldquo;New Fee Definition&rdquo; above to create one.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th scope="col" className="px-6 py-3">Fee Name</th>
                  <th scope="col" className="px-6 py-3">Default Amount</th>
                  <th scope="col" className="px-6 py-3">Created By</th>
                  <th scope="col" className="px-6 py-3">Created</th>
                  <th scope="col" className="px-6 py-3">
                    {activeTab === "active" ? "Last Updated" : "Archived On"}
                  </th>
                  <th scope="col" className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {currentList.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">{item.name}</td>
                    <td className="px-6 py-4 font-mono font-semibold text-foreground">
                      {currencyFormatter.format(item.amount)}
                    </td>
                    <td className="px-6 py-4 text-foreground">{item.creator_name}</td>
                    <td className="px-6 py-4 text-muted-foreground text-xs">
                      {formatDate(item.created_at)}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground text-xs">
                      {formatDate(item.archived_at ? item.archived_at : item.updated_at)}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      {activeTab === "active" ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingDefinition(item)}
                            className="gap-1 text-xs"
                          >
                            <Edit2 className="size-3.5" />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setArchivingDefinition(item)}
                            className="gap-1 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Archive className="size-3.5" />
                            Archive
                          </Button>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Archived</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateFeeDialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />

      <EditFeeDialog
        definition={editingDefinition}
        isOpen={editingDefinition !== null}
        onClose={() => setEditingDefinition(null)}
      />

      <ArchiveFeeDialog
        definition={archivingDefinition}
        isOpen={archivingDefinition !== null}
        onClose={() => setArchivingDefinition(null)}
      />
    </div>
  );
}

