"use client";

import { useState } from "react";
import { Plus, Edit2, Archive, CheckCircle2, History, CreditCard, QrCode, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PaymentAccountDTO } from "../contracts";
import { getPaymentAccountQrUrl } from "../actions";
import { CreatePaymentAccountDialog } from "./create-payment-account-dialog";
import { EditPaymentAccountDialog } from "./edit-payment-account-dialog";
import { ArchivePaymentAccountDialog } from "./archive-payment-account-dialog";

export function PaymentAccountList({
  accounts,
  canManage,
}: {
  accounts: PaymentAccountDTO[];
  canManage: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"active" | "archived">("active");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<PaymentAccountDTO | null>(null);
  const [archivingAccount, setArchivingAccount] = useState<PaymentAccountDTO | null>(null);
  const [previewQr, setPreviewQr] = useState<{ label: string; fileId: string } | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [isLoadingQr, setIsLoadingQr] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);

  const activeAccounts = accounts.filter((a) => a.archived_at === null);
  const archivedAccounts = accounts.filter((a) => a.archived_at !== null);
  const currentList = activeTab === "active" ? activeAccounts : archivedAccounts;

  async function handleViewQr(label: string, fileId: string) {
    setPreviewQr({ label, fileId });
    setQrUrl(null);
    setQrError(null);
    setIsLoadingQr(true);

    try {
      const result = await getPaymentAccountQrUrl(fileId);
      if (result.success) {
        setQrUrl(result.url);
      } else {
        setQrError(result.error);
      }
    } catch {
      setQrError("Failed to load QR code image. Please check your connection.");
    } finally {
      setIsLoadingQr(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <CreditCard className="size-5 text-primary" />
            Payment Accounts
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage destination accounts and instructions for student bank and e-wallet transfers.
          </p>
        </div>
        {canManage && (
          <Button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="w-full gap-1.5 sm:w-auto"
          >
            <Plus className="size-4" />
            Add Payment Account
          </Button>
        )}
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
          Active Accounts ({activeAccounts.length})
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
          Archived Accounts ({archivedAccounts.length})
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
        {currentList.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm font-medium text-muted-foreground">
              {activeTab === "active"
                ? "No active payment accounts found."
                : "No archived payment accounts found."}
            </p>
            {activeTab === "active" && canManage && (
              <p className="text-xs text-muted-foreground mt-1">
                Click &ldquo;Add Payment Account&rdquo; above to configure a destination.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th scope="col" className="px-6 py-3">Destination</th>
                  <th scope="col" className="px-6 py-3">Account Holder</th>
                  <th scope="col" className="px-6 py-3">Reference / Number</th>
                  <th scope="col" className="px-6 py-3">Instructions</th>
                  <th scope="col" className="px-6 py-3">QR</th>
                  {canManage && <th scope="col" className="px-6 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {currentList.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-semibold text-foreground">
                      {item.label}
                    </td>
                    <td className="px-6 py-4 text-foreground">{item.account_name}</td>
                    <td className="px-6 py-4 font-mono text-sm text-foreground">
                      {item.account_reference}
                    </td>
                    <td
                      className="px-6 py-4 text-muted-foreground text-xs max-w-xs truncate"
                      title={item.instructions || undefined}
                    >
                      {item.instructions || "—"}
                    </td>
                    <td className="px-6 py-4">
                      {item.qr_file_id ? (
                        <button
                          type="button"
                          onClick={() => handleViewQr(item.label, item.qr_file_id!)}
                          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                          title="Click to view QR code"
                        >
                          <QrCode className="size-3" />
                          View QR
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    {canManage && (
                      <td className="px-6 py-4 text-right space-x-2">
                        {activeTab === "active" ? (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingAccount(item)}
                              className="gap-1 text-xs"
                            >
                              <Edit2 className="size-3.5" />
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setArchivingAccount(item)}
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
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreatePaymentAccountDialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />

      <EditPaymentAccountDialog
        account={editingAccount}
        isOpen={editingAccount !== null}
        onClose={() => setEditingAccount(null)}
      />

      <ArchivePaymentAccountDialog
        account={archivingAccount}
        isOpen={archivingAccount !== null}
        onClose={() => setArchivingAccount(null)}
      />

      <Dialog
        open={previewQr !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewQr(null);
            setQrUrl(null);
            setQrError(null);
          }
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)] sm:max-w-xs text-center">
          <DialogHeader>
            <DialogTitle>{previewQr?.label} QR Code</DialogTitle>
            <DialogDescription>
              Scan this QR code to complete transfer payments.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center justify-center min-h-[200px] py-4">
            {isLoadingQr && (
              <div className="flex flex-col items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="size-6 animate-spin text-primary" />
                <span>Loading QR code...</span>
              </div>
            )}
            {qrError && (
              <p className="text-sm text-destructive">{qrError}</p>
            )}
            {qrUrl && !isLoadingQr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrUrl}
                alt={`${previewQr?.label} QR Code`}
                className="max-h-64 max-w-full rounded-lg border border-border shadow-xs object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
