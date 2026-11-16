"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  FileImage,
  History,
  Loader2,
  QrCode,
  Trash2,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { compressImage, MAX_ORIGINAL_BYTES } from "@/lib/compress-image";
import { cn } from "@/lib/utils";
import { submitTransferEvidence, uploadTransferProof } from "../actions";
import { formatPhp } from "../calculations";
import {
  hasSameSemesterObligations,
  type ObligationWithStandingDTO,
  type StudentPaymentAccountDTO,
} from "../contracts";
import { PAYMENT_PROOF_MAX_BYTES } from "../schemas";

type WizardStage = "obligations" | "destination" | "proof" | "review" | "done";

const STEPS = ["Obligations", "Destination", "Proof", "Review"] as const;
const stageIndex: Record<WizardStage, number> = {
  obligations: 0,
  destination: 1,
  proof: 2,
  review: 3,
  done: 4,
};

type SemesterGroup = {
  semesterId: string;
  label: string;
  isPastSemester: boolean;
  obligations: ObligationWithStandingDTO[];
};

function StepTracker({ current }: { current: number }) {
  const clamped = Math.min(current, STEPS.length - 1);
  return (
    <>
      <p className="text-xs font-medium text-muted-foreground sm:hidden">
        Step {clamped + 1} of {STEPS.length} ·{" "}
        <span className="text-foreground">{STEPS[clamped]}</span>
      </p>
      <ol
        aria-label="Transfer submission steps"
        className="hidden items-center gap-2 text-xs sm:flex"
      >
        {STEPS.map((step, i) => (
          <li
            key={step}
            aria-current={i === current ? "step" : undefined}
            className="flex flex-1 items-center gap-2 last:flex-none"
          >
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                i < current && "border-primary bg-primary text-primary-foreground",
                i === current && "border-primary text-primary",
                i > current && "border-border text-muted-foreground"
              )}
            >
              {i < current ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span
              className={cn(
                "font-medium",
                i <= current ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {step}
            </span>
            {i < STEPS.length - 1 && (
              <span
                className={cn(
                  "h-px flex-1",
                  i < current ? "bg-primary" : "bg-border"
                )}
              />
            )}
          </li>
        ))}
      </ol>
    </>
  );
}

export function StudentTransferWizardDialog({
  isOpen,
  onClose,
  obligations,
  paymentAccounts,
  initialSemesterId,
  onViewPaymentHistory,
}: {
  isOpen: boolean;
  onClose: () => void;
  obligations: ObligationWithStandingDTO[];
  paymentAccounts: StudentPaymentAccountDTO[];
  initialSemesterId?: string | null;
  onViewPaymentHistory?: () => void;
}) {
  const referenceInputId = useId();
  const proofInputId = useId();

  const semesterGroups = useMemo<SemesterGroup[]>(() => {
    const payable = obligations.filter(
      (item) =>
        item.status === "unpaid" || item.status === "pending_verification"
    );
    const grouped = new Map<string, SemesterGroup>();
    for (const item of payable) {
      const existing = grouped.get(item.semester_id);
      if (existing) {
        existing.obligations.push(item);
      } else {
        grouped.set(item.semester_id, {
          semesterId: item.semester_id,
          label: item.semester_code ?? "Academic Term",
          isPastSemester: Boolean(item.is_past_semester),
          obligations: [item],
        });
      }
    }
    return Array.from(grouped.values()).sort((a, b) => {
      if (a.isPastSemester !== b.isPastSemester) {
        return a.isPastSemester ? 1 : -1;
      }
      return b.label.localeCompare(a.label);
    });
  }, [obligations]);

  const defaultSemesterId = useMemo(() => {
    if (
      initialSemesterId &&
      semesterGroups.some((g) => g.semesterId === initialSemesterId)
    ) {
      return initialSemesterId;
    }
    return semesterGroups[0]?.semesterId ?? "";
  }, [initialSemesterId, semesterGroups]);

  const [stage, setStage] = useState<WizardStage>("obligations");
  const [selectedSemesterId, setSelectedSemesterId] =
    useState<string>(defaultSemesterId);
  const [selectedObligationIds, setSelectedObligationIds] = useState<string[]>(
    []
  );
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    paymentAccounts[0]?.id ?? ""
  );
  const [referenceNumber, setReferenceNumber] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
  const [uploadedProofFileId, setUploadedProofFileId] = useState<string | null>(
    null
  );
  const [uploadRequestKey, setUploadRequestKey] = useState<string | null>(null);
  const [submissionRequestKey, setSubmissionRequestKey] = useState<
    string | null
  >(null);
  const [copiedAccountId, setCopiedAccountId] = useState<string | null>(null);
  const [submittedAmount, setSubmittedAmount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Sync defaults when opening cleanly or when available groups/accounts change while closed.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setStage("obligations");
      setSelectedSemesterId(defaultSemesterId);
      setSelectedObligationIds([]);
      setSelectedAccountId(paymentAccounts[0]?.id ?? "");
      setReferenceNumber("");
      setProofFile(null);
      setProofPreviewUrl(null);
      setUploadedProofFileId(null);
      setUploadRequestKey(null);
      setSubmissionRequestKey(null);
      setCopiedAccountId(null);
      setSubmittedAmount(0);
      setError(null);
    }
  }

  useEffect(() => {
    return () => {
      if (proofPreviewUrl) {
        URL.revokeObjectURL(proofPreviewUrl);
      }
    };
  }, [proofPreviewUrl]);

  const activeGroup = useMemo(
    () =>
      semesterGroups.find((g) => g.semesterId === selectedSemesterId) ??
      semesterGroups[0] ??
      null,
    [semesterGroups, selectedSemesterId]
  );

  const selectedObligations = useMemo(() => {
    if (!activeGroup) return [];
    const selectedSet = new Set(selectedObligationIds);
    return activeGroup.obligations.filter((item) => selectedSet.has(item.id));
  }, [activeGroup, selectedObligationIds]);

  const selectedTotal = useMemo(
    () =>
      selectedObligations.reduce((sum, item) => sum + Number(item.amount), 0),
    [selectedObligations]
  );

  const selectedAccount = useMemo(
    () =>
      paymentAccounts.find((account) => account.id === selectedAccountId) ??
      null,
    [paymentAccounts, selectedAccountId]
  );

  function handleClose() {
    if (isPending) return;
    if (proofPreviewUrl) {
      URL.revokeObjectURL(proofPreviewUrl);
    }
    setProofPreviewUrl(null);
    setProofFile(null);
    setError(null);
    onClose();
  }

  function handleSelectSemester(semesterId: string) {
    if (semesterId === selectedSemesterId) return;
    setError(null);
    setSelectedSemesterId(semesterId);
    // Strict FL-023 rule: one submission covers one semester only.
    setSelectedObligationIds([]);
    setSubmissionRequestKey(null);
  }

  function toggleObligation(obligationId: string) {
    setError(null);
    setSubmissionRequestKey(null);
    setSelectedObligationIds((prev) =>
      prev.includes(obligationId)
        ? prev.filter((id) => id !== obligationId)
        : [...prev, obligationId]
    );
  }

  function handleToggleAllInSemester() {
    if (!activeGroup) return;
    setError(null);
    setSubmissionRequestKey(null);
    const allIds = activeGroup.obligations.map((o) => o.id);
    const allSelected =
      allIds.length > 0 && allIds.every((id) => selectedObligationIds.includes(id));
    setSelectedObligationIds(allSelected ? [] : allIds);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const selected = e.target.files?.[0] ?? null;
    if (proofPreviewUrl) {
      URL.revokeObjectURL(proofPreviewUrl);
      setProofPreviewUrl(null);
    }
    setUploadedProofFileId(null);
    setUploadRequestKey(null);
    setSubmissionRequestKey(null);

    if (!selected) {
      setProofFile(null);
      return;
    }
    if (!selected.type.startsWith("image/")) {
      setError("Please select a valid image file (JPEG, PNG, or WebP).");
      setProofFile(null);
      e.target.value = "";
      return;
    }
    if (selected.size === 0) {
      setError("The selected file is empty.");
      setProofFile(null);
      e.target.value = "";
      return;
    }
    if (selected.size > MAX_ORIGINAL_BYTES) {
      setError(
        "The image is larger than 15 MB. Please choose a smaller receipt image."
      );
      setProofFile(null);
      e.target.value = "";
      return;
    }

    setProofFile(selected);
    setProofPreviewUrl(URL.createObjectURL(selected));
  }

  function handleRemoveFile() {
    setError(null);
    if (proofPreviewUrl) {
      URL.revokeObjectURL(proofPreviewUrl);
      setProofPreviewUrl(null);
    }
    setProofFile(null);
    setUploadedProofFileId(null);
    setUploadRequestKey(null);
    setSubmissionRequestKey(null);
  }

  async function handleCopyReference(account: StudentPaymentAccountDTO) {
    try {
      await navigator.clipboard.writeText(account.account_reference);
      setCopiedAccountId(account.id);
      setTimeout(() => {
        setCopiedAccountId((current) =>
          current === account.id ? null : current
        );
      }, 2000);
    } catch {
      // Clipboard may be blocked in restricted browser contexts; ignore silently.
    }
  }

  function handleNextFromObligations() {
    setError(null);
    if (!activeGroup) {
      setError("No payable obligations are available.");
      return;
    }
    if (selectedObligations.length === 0) {
      setError("Select at least one obligation to pay.");
      return;
    }
    if (
      !hasSameSemesterObligations(selectedObligations, activeGroup.semesterId)
    ) {
      setError("All selected obligations must belong to the same semester.");
      return;
    }
    setSelectedSemesterId(activeGroup.semesterId);
    setStage("destination");
  }

  function handleNextFromDestination() {
    setError(null);
    if (!selectedAccount) {
      setError("Select an active destination account to continue.");
      return;
    }
    setStage("proof");
  }

  function handleNextFromProof() {
    setError(null);
    const trimmedRef = referenceNumber.trim();
    if (!trimmedRef) {
      setError("Enter the transfer reference or transaction number.");
      return;
    }
    if (trimmedRef.length > 120) {
      setError("Transfer reference number cannot exceed 120 characters.");
      return;
    }
    if (trimmedRef.replace(/[^a-zA-Z0-9]/g, "").length < 6) {
      setError(
        "Transfer reference number must contain at least 6 letters or digits."
      );
      return;
    }
    if (!proofFile) {
      setError("Upload a photo or screenshot of your transfer receipt.");
      return;
    }
    setStage("review");
  }

  function handleSubmit() {
    setError(null);
    if (!activeGroup || selectedObligations.length === 0 || !selectedAccount || !proofFile) {
      setError("Some transfer details are missing. Review previous steps.");
      return;
    }
    if (
      !hasSameSemesterObligations(selectedObligations, activeGroup.semesterId)
    ) {
      setError("All selected obligations must belong to the same semester.");
      return;
    }

    const activeUploadKey = uploadRequestKey ?? crypto.randomUUID();
    if (!uploadRequestKey) setUploadRequestKey(activeUploadKey);

    const activeSubmissionKey = submissionRequestKey ?? crypto.randomUUID();
    if (!submissionRequestKey) setSubmissionRequestKey(activeSubmissionKey);

    startTransition(async () => {
      let fileId = uploadedProofFileId;

      if (!fileId) {
        let compressed: File;
        try {
          compressed = await compressImage(proofFile, "payment_proof");
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not process the receipt image. Please try another file."
          );
          return;
        }

        if (compressed.size > PAYMENT_PROOF_MAX_BYTES) {
          setError(
            "The receipt image is still larger than 4 MB after compression. Please choose a smaller image."
          );
          return;
        }

        const formData = new FormData();
        formData.append("file", compressed);
        formData.append("requestKey", activeUploadKey);

        const uploadRes = await uploadTransferProof(formData);
        if (!uploadRes.success) {
          setError(uploadRes.error);
          return;
        }
        fileId = uploadRes.fileId;
        setUploadedProofFileId(fileId);
      }

      const submitRes = await submitTransferEvidence({
        semesterId: activeGroup.semesterId,
        obligationIds: selectedObligations.map((item) => item.id),
        paymentAccountId: selectedAccount.id,
        referenceNumber: referenceNumber.trim(),
        proofFileId: fileId,
        requestKey: activeSubmissionKey,
      });

      if (!submitRes.success) {
        setError(submitRes.error);
        return;
      }

      setSubmittedAmount(submitRes.amount);
      setStage("done");
    });
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isPending) handleClose();
      }}
    >
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] grid-cols-1 overflow-x-hidden overflow-y-auto p-5 sm:max-w-xl sm:p-6">
        <DialogHeader>
          <DialogTitle>
            {stage === "done"
              ? "Transfer Evidence Submitted"
              : "Submit Transfer Evidence"}
          </DialogTitle>
          <DialogDescription>
            {stage === "done"
              ? "Your submission is pending Council verification."
              : "Select complete obligations from a single semester and upload your transfer receipt."}
          </DialogDescription>
        </DialogHeader>

        {stage !== "done" && <StepTracker current={stageIndex[stage]} />}

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Step 1: Semester & Complete Obligation Selection */}
        {stage === "obligations" && (
          <div className="min-w-0 space-y-4">
            {semesterGroups.length === 0 ? (
              <div className="rounded-xl border border-border bg-muted/30 p-5 text-center text-sm text-muted-foreground">
                You have no unpaid obligations available to submit transfer
                evidence for.
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    Academic Term (one semester per submission)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {semesterGroups.map((group) => {
                      const isSelected =
                        group.semesterId === activeGroup?.semesterId;
                      return (
                        <button
                          key={group.semesterId}
                          type="button"
                          onClick={() => handleSelectSemester(group.semesterId)}
                          className={cn(
                            "inline-flex min-h-11 items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-medium transition-colors cursor-pointer",
                            isSelected
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background text-foreground hover:bg-muted/50"
                          )}
                        >
                          <span>{group.label}</span>
                          {group.isPastSemester && (
                            <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                              Prior Term
                            </span>
                          )}
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                            {group.obligations.length}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {activeGroup && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        Select complete obligations
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleToggleAllInSemester}
                        className="min-h-11 px-3 text-xs"
                      >
                        {activeGroup.obligations.every((o) =>
                          selectedObligationIds.includes(o.id)
                        )
                          ? "Clear all"
                          : "Select all"}
                      </Button>
                    </div>

                    <div className="divide-y divide-border rounded-xl border border-border bg-card">
                      {activeGroup.obligations.map((item) => {
                        const checked = selectedObligationIds.includes(item.id);
                        return (
                          <label
                            key={item.id}
                            className={cn(
                              "flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3.5 py-3 transition-colors first:rounded-t-xl last:rounded-b-xl",
                              checked
                                ? "bg-primary/5"
                                : "hover:bg-muted/40"
                            )}
                          >
                            <div className="flex min-w-0 items-start gap-3">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleObligation(item.id)}
                                className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
                              />
                              <div className="min-w-0 space-y-1">
                                <div className="text-sm font-medium text-foreground">
                                  {item.description}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                  <span className="capitalize">{item.kind}</span>
                                  {item.status === "pending_verification" && (
                                    <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                                      Pending Review
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                              {formatPhp(Number(item.amount))}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-3">
                  <div className="space-y-0.5">
                    <div className="text-xs text-muted-foreground">
                      Selected ({selectedObligations.length}{" "}
                      {selectedObligations.length === 1 ? "item" : "items"})
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Full obligation amounts only. Pending review does not settle
                      dues.
                    </div>
                  </div>
                  <div className="font-heading text-lg font-semibold tabular-nums text-foreground">
                    {formatPhp(selectedTotal)}
                  </div>
                </div>
              </>
            )}

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                className="min-h-11"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleNextFromObligations}
                disabled={selectedObligations.length === 0}
                className="min-h-11"
              >
                Continue to Destination
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 2: Destination Payment Account */}
        {stage === "destination" && (
          <div className="min-w-0 space-y-4">
            {paymentAccounts.length === 0 ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900">
                No active Council payment destination accounts are currently
                available. Please contact the Council before submitting a
                transfer.
              </div>
            ) : (
              <div
                role="radiogroup"
                aria-label="Destination payment accounts"
                className="space-y-2.5"
              >
                {paymentAccounts.map((account) => {
                  const isSelected = account.id === selectedAccountId;
                  const isCopied = copiedAccountId === account.id;
                  return (
                    <div
                      key={account.id}
                      className={cn(
                        "rounded-xl border p-3.5 transition-colors",
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border bg-card hover:bg-muted/30"
                      )}
                    >
                      <label className="flex min-h-11 cursor-pointer items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <input
                            type="radio"
                            name="payment-account"
                            checked={isSelected}
                            onChange={() => {
                              setError(null);
                              setSelectedAccountId(account.id);
                            }}
                            className="mt-1 size-4 shrink-0 accent-primary"
                          />
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-foreground">
                                {account.label}
                              </span>
                              {account.qr_url && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                  <QrCode className="size-3" />
                                  QR available
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {account.account_name}
                            </div>
                            <div className="font-mono text-xs font-medium text-foreground">
                              {account.account_reference}
                            </div>
                            {account.instructions && (
                              <p className="pt-1 text-xs leading-relaxed text-muted-foreground">
                                {account.instructions}
                              </p>
                            )}
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.preventDefault();
                            void handleCopyReference(account);
                          }}
                          className="min-h-11 shrink-0 gap-1.5 text-xs"
                        >
                          {isCopied ? (
                            <>
                              <Check className="size-3.5 text-emerald-600" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="size-3.5" />
                              Copy
                            </>
                          )}
                        </Button>
                      </label>

                      {isSelected && account.qr_url && (
                        <div className="mt-3 flex flex-col items-center gap-2 rounded-lg border border-border bg-background p-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={account.qr_url}
                            alt={`${account.label} payment QR code`}
                            className="max-h-52 max-w-full rounded-md object-contain"
                          />
                          <span className="text-[11px] text-muted-foreground">
                            Scan to transfer{" "}
                            <strong className="font-semibold tabular-nums text-foreground">
                              {formatPhp(selectedTotal)}
                            </strong>
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setError(null);
                  setStage("obligations");
                }}
                className="min-h-11"
              >
                Back
              </Button>
              <Button
                type="button"
                onClick={handleNextFromDestination}
                disabled={!selectedAccount}
                className="min-h-11"
              >
                Continue to Proof
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 3: Transfer Reference & Evidence Upload */}
        {stage === "proof" && (
          <div className="min-w-0 space-y-4">
            {selectedAccount && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs">
                <div>
                  <div className="font-medium text-foreground">
                    {selectedAccount.label} · {selectedAccount.account_name}
                  </div>
                  <div className="font-mono text-muted-foreground">
                    {selectedAccount.account_reference}
                  </div>
                </div>
                <div className="font-heading text-base font-semibold tabular-nums text-foreground">
                  {formatPhp(selectedTotal)}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor={referenceInputId}
                className="block text-sm font-medium text-foreground"
              >
                Transfer Reference Number
              </label>
              <Input
                id={referenceInputId}
                type="text"
                value={referenceNumber}
                onChange={(e) => {
                  setError(null);
                  setSubmissionRequestKey(null);
                  setReferenceNumber(e.target.value);
                }}
                placeholder="e.g., 1234 567 890123 (GCash) or bank/InstaPay reference"
                maxLength={120}
                className="min-h-11 text-base md:text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Enter the exact reference or trace number from your receipt
                (e.g., 13-digit GCash 4-3-6 number, or Maya, BPI, BDO, RCBC,
                BankCom, UnionBank / InstaPay reference).
              </p>
            </div>

            <div className="space-y-2">
              <label
                htmlFor={proofInputId}
                className="block text-sm font-medium text-foreground"
              >
                Receipt Screenshot / Photo
              </label>

              {!proofFile ? (
                <label
                  htmlFor={proofInputId}
                  className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 p-4 text-center transition-colors hover:bg-muted/40"
                >
                  <Upload className="size-5 text-muted-foreground" />
                  <div className="text-sm font-medium text-foreground">
                    Choose receipt image
                  </div>
                  <div className="text-xs text-muted-foreground">
                    JPEG, PNG, or WebP (compressed automatically, max 4 MB stored)
                  </div>
                </label>
              ) : (
                <div className="min-w-0 space-y-3 overflow-hidden rounded-xl border border-border bg-card p-3">
                  {proofPreviewUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={proofPreviewUrl}
                      alt="Selected transfer receipt preview"
                      className="mx-auto max-h-56 max-w-full rounded-lg border border-border object-contain"
                    />
                  )}
                  <div className="flex min-w-0 items-center justify-between gap-2 text-xs">
                    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-muted-foreground">
                      <FileImage className="size-4 shrink-0 text-primary" />
                      <span
                        title={proofFile.name}
                        className="block truncate font-medium text-foreground"
                      >
                        {proofFile.name}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveFile}
                      className="min-h-11 shrink-0 gap-1.5 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                      Remove
                    </Button>
                  </div>
                </div>
              )}

              <input
                id={proofInputId}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="sr-only"
              />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setError(null);
                  setStage("destination");
                }}
                className="min-h-11"
              >
                Back
              </Button>
              <Button
                type="button"
                onClick={handleNextFromProof}
                className="min-h-11"
              >
                Review Submission
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 4: Review & Confirm */}
        {stage === "review" && activeGroup && selectedAccount && proofFile && (
          <div className="min-w-0 space-y-4">
            <div className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
              <div className="flex items-center justify-between border-b border-border pb-2.5">
                <span className="text-xs text-muted-foreground">
                  Academic Term
                </span>
                <span className="font-medium text-foreground">
                  {activeGroup.label}
                </span>
              </div>

              <div className="space-y-1.5 border-b border-border pb-2.5">
                <div className="text-xs text-muted-foreground">
                  Covered Obligations ({selectedObligations.length})
                </div>
                <ul className="space-y-1">
                  {selectedObligations.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="truncate text-foreground">
                        {item.description}
                      </span>
                      <span className="shrink-0 font-medium tabular-nums text-foreground">
                        {formatPhp(Number(item.amount))}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between pt-1.5 font-semibold">
                  <span className="text-xs text-muted-foreground">
                    Total Transfer Amount
                  </span>
                  <span className="font-heading text-base tabular-nums text-foreground">
                    {formatPhp(selectedTotal)}
                  </span>
                </div>
              </div>

              <div className="space-y-1 border-b border-border pb-2.5 text-xs">
                <div className="text-muted-foreground">
                  Destination Snapshot
                </div>
                <div className="font-medium text-foreground">
                  {selectedAccount.label} · {selectedAccount.account_name}
                </div>
                <div className="font-mono text-muted-foreground">
                  {selectedAccount.account_reference}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 border-b border-border pb-2.5 text-xs">
                <span className="shrink-0 text-muted-foreground">
                  Reference Number
                </span>
                <span className="min-w-0 break-all text-right font-mono font-medium text-foreground">
                  {referenceNumber.trim()}
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="text-muted-foreground">Receipt Evidence</div>
                {proofPreviewUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={proofPreviewUrl}
                    alt="Transfer receipt evidence preview"
                    className="mx-auto max-h-80 w-full rounded-lg border border-border bg-muted/20 object-contain sm:max-h-96"
                  />
                )}
              </div>
            </div>

            <p className="text-xs leading-relaxed text-muted-foreground">
              Submitting evidence creates a pending record for Council review.
              Your obligations remain active until verified.
            </p>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setError(null);
                  setStage("proof");
                }}
                disabled={isPending}
                className="min-h-11"
              >
                Back
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={isPending}
                className="min-h-11"
              >
                {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                {isPending ? "Submitting..." : "Submit Transfer Evidence"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Confirmation Stage */}
        {stage === "done" && (
          <div className="min-w-0 space-y-4">
            <div className="flex flex-col items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 text-center">
              <CheckCircle2 className="size-8 text-emerald-600" />
              <div className="space-y-1">
                <div className="font-heading text-xl font-semibold tabular-nums text-foreground">
                  {formatPhp(submittedAmount)}
                </div>
                <span className="inline-flex rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                  Pending Review
                </span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Your transfer reference and proof have been saved. Council will
                verify the transfer manually; your obligations remain payable
                until verified.
              </p>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                className="min-h-11"
              >
                Close
              </Button>
              <Button
                type="button"
                onClick={() => {
                  handleClose();
                  onViewPaymentHistory?.();
                }}
                className="min-h-11 gap-2"
              >
                <History className="size-4" />
                View Payment History
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
