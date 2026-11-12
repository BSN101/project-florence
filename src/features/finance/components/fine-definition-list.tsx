"use client";

import { useState } from "react";
import { Plus, Edit2, Archive, CheckCircle2, History } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { FineDefinitionCatalogItem } from "../contracts";
import { CreateFineDialog } from "./create-fine-dialog";
import { EditFineDialog } from "./edit-fine-dialog";
import { ArchiveFineDialog } from "./archive-fine-dialog";

export function FineDefinitionList({
  definitions,
  canManage,
}: {
  definitions: FineDefinitionCatalogItem[];
  canManage: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"active" | "archived">("active");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingDefinition, setEditingDefinition] = useState<FineDefinitionCatalogItem | null>(null);
  const [archivingDefinition, setArchivingDefinition] = useState<FineDefinitionCatalogItem | null>(null);

  const activeFines = definitions.filter((f) => f.archived_at === null);
  const archivedFines = definitions.filter((f) => f.archived_at !== null);
  const currentList = activeTab === "active" ? activeFines : archivedFines;

  const currencyFormatter = new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  });

  function formatDate(isoString: string) {
    return new Date(isoString).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  return (
    <div className="space-y-6">
      {/* Header and Action */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Fine Definitions</h2>
          <p className="text-sm text-muted-foreground">
            Manage reusable fine penalties for event attendance absences and lateness.
          </p>
        </div>
        {canManage && (
          <Button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="w-full gap-1.5 sm:w-auto"
          >
            <Plus className="size-4" />
            New Fine Definition
          </Button>
        )}
      </div>

      {/* Tabs */}
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
          Active Fines ({activeFines.length})
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
          Archived Fines ({archivedFines.length})
        </button>
      </div>

      {/* Table / List */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
        {currentList.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm font-medium text-muted-foreground">
              {activeTab === "active"
                ? "No active fine definitions found."
                : "No archived fine definitions found."}
            </p>
            {activeTab === "active" && (
              <p className="text-xs text-muted-foreground mt-1">
                Click &ldquo;New Fine Definition&rdquo; above to create one.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th scope="col" className="px-6 py-3">Fine Name</th>
                  <th scope="col" className="px-6 py-3">Default Amount</th>
                  <th scope="col" className="px-6 py-3">Created By</th>
                  <th scope="col" className="px-6 py-3">Status</th>
                  <th scope="col" className="px-6 py-3">
                    {activeTab === "active" ? "Last Updated" : "Archived On"}
                  </th>
                  {canManage && <th scope="col" className="px-6 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {currentList.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">
                      {item.name}
                    </td>
                    <td className="px-6 py-4 font-mono font-semibold text-foreground">
                      {currencyFormatter.format(item.amount)}
                    </td>
                    <td className="px-6 py-4 text-foreground">
                      {item.creator_name}
                    </td>
                    <td className="px-6 py-4">
                      {item.archived_at ? (
                        <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                          Archived
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground text-xs">
                      {formatDate(item.archived_at ? item.archived_at : item.updated_at)}
                    </td>
                    {canManage && (
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
                          <span className="text-xs text-muted-foreground italic">
                            Locked
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <CreateFineDialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />

      <EditFineDialog
        definition={editingDefinition}
        isOpen={editingDefinition !== null}
        onClose={() => setEditingDefinition(null)}
      />

      <ArchiveFineDialog
        definition={archivingDefinition}
        isOpen={archivingDefinition !== null}
        onClose={() => setArchivingDefinition(null)}
      />
    </div>
  );
}
