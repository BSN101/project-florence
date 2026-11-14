"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertCircle, Loader2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { previewFeeAudience, publishFeeObligations } from "../actions";
import type { FeeDefinitionDTO, FeePublicationPreview } from "../contracts";
import { ACADEMIC_STATUSES, YEAR_LEVELS, type AcademicStatus, type YearLevel } from "../schemas";

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export function PublishFeeDialog({
  isOpen,
  onClose,
  definitions,
  semesterId,
  initialDefinitionId,
}: {
  isOpen: boolean;
  onClose: () => void;
  definitions: FeeDefinitionDTO[];
  semesterId: string;
  initialDefinitionId?: string;
}) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Publish Fee Obligations</DialogTitle>
          <DialogDescription>
            Select target students by year level and academic status. Deduplication ensures students
            who already received this fee in this semester will not be charged twice.
          </DialogDescription>
        </DialogHeader>

        {isOpen && definitions.length > 0 && (
          <PublishFeeForm
            key={initialDefinitionId ?? definitions[0].id}
            definitions={definitions}
            semesterId={semesterId}
            initialDefinitionId={initialDefinitionId}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PublishFeeForm({
  definitions,
  semesterId,
  initialDefinitionId,
  onClose,
}: {
  definitions: FeeDefinitionDTO[];
  semesterId: string;
  initialDefinitionId?: string;
  onClose: () => void;
}) {
  const [selectedFeeId, setSelectedFeeId] = useState<string>(
    initialDefinitionId ?? definitions[0]?.id ?? ""
  );
  const [selectedYears, setSelectedYears] = useState<YearLevel[]>([1, 2, 3, 4]);
  const [selectedStatuses, setSelectedStatuses] = useState<AcademicStatus[]>([
    "regular",
    "irregular",
  ]);
  const [previewState, setPreviewState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ready"; preview: FeePublicationPreview }
    | { status: "error"; error: string }
  >({ status: "loading" });
  const [submitError, setSubmitError] = useState<string | null>(null);
  // One key per audience selection: a retry replays the same publication, a changed selection is a new one.
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [isPending, startTransition] = useTransition();

  const hasAudience = selectedYears.length > 0 && selectedStatuses.length > 0;

  useEffect(() => {
    if (!selectedFeeId || !semesterId || selectedYears.length === 0 || selectedStatuses.length === 0) {
      return;
    }

    let active = true;

    previewFeeAudience({
      feeDefinitionId: selectedFeeId,
      semesterId,
      yearLevels: selectedYears,
      academicStatuses: selectedStatuses,
    }).then((res) => {
      if (!active) return;
      if (res.success) {
        setPreviewState({ status: "ready", preview: res.preview });
      } else {
        setPreviewState({ status: "error", error: res.error });
      }
    });

    return () => {
      active = false;
    };
  }, [selectedFeeId, semesterId, selectedYears, selectedStatuses]);

  function handlePublish() {
    setSubmitError(null);
    if (!selectedFeeId) {
      setSubmitError("Please select a fee definition.");
      return;
    }
    if (selectedYears.length === 0) {
      setSubmitError("Please select at least one year level.");
      return;
    }
    if (selectedStatuses.length === 0) {
      setSubmitError("Please select at least one academic status.");
      return;
    }

    startTransition(async () => {
      const res = await publishFeeObligations({
        feeDefinitionId: selectedFeeId,
        semesterId,
        yearLevels: selectedYears,
        academicStatuses: selectedStatuses,
        requestKey,
      });

      if (!res.success) {
        setSubmitError(res.error);
        return;
      }

      onClose();
    });
  }

  const effectivePreview = hasAudience && previewState.status === "ready" ? previewState.preview : null;
  const isPreviewLoading = hasAudience && previewState.status === "loading";

  return (
    <div className="space-y-4 py-2">
      {submitError && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/15 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{submitError}</span>
        </div>
      )}

      <div>
        <label htmlFor="publish-fee-select" className="mb-1 block text-sm font-medium text-foreground">
          Fee Definition
        </label>
        <select
          id="publish-fee-select"
          value={selectedFeeId}
          onChange={(e) => {
            setSelectedFeeId(e.target.value);
            setPreviewState({ status: "loading" });
            setRequestKey(crypto.randomUUID());
          }}
          disabled={isPending}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {definitions.map((def) => (
            <option key={def.id} value={def.id}>
              {def.name} ({currencyFormatter.format(def.amount)})
            </option>
          ))}
        </select>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-foreground">Target Year Levels</legend>
        <div className="flex flex-wrap gap-4 text-sm text-foreground">
          {YEAR_LEVELS.map((year) => (
            <label key={year} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="size-4 rounded border-input"
                checked={selectedYears.includes(year)}
                disabled={isPending}
                onChange={() => {
                  setSelectedYears(toggle(selectedYears, year));
                  setPreviewState({ status: "loading" });
                  setRequestKey(crypto.randomUUID());
                }}
              />
              Year {year}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-foreground">Academic Status</legend>
        <div className="flex flex-wrap gap-4 text-sm text-foreground">
          {ACADEMIC_STATUSES.map((status) => (
            <label key={status} className="flex items-center gap-2 capitalize cursor-pointer">
              <input
                type="checkbox"
                className="size-4 rounded border-input"
                checked={selectedStatuses.includes(status)}
                disabled={isPending}
                onChange={() => {
                  setSelectedStatuses(toggle(selectedStatuses, status));
                  setPreviewState({ status: "loading" });
                  setRequestKey(crypto.randomUUID());
                }}
              />
              {status}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm space-y-2">
        <div className="flex items-center justify-between text-muted-foreground font-medium">
          <span className="flex items-center gap-1.5">
            <Users className="size-4" />
            Audience Preview
          </span>
          {isPreviewLoading && <Loader2 className="size-3.5 animate-spin" />}
        </div>

        {previewState.status === "error" && (
          <p className="text-xs text-destructive">{previewState.error}</p>
        )}

        {!hasAudience && (
          <p className="text-xs text-muted-foreground">Select at least one year level and academic status to view audience count.</p>
        )}

        {effectivePreview && !isPreviewLoading && (
          <div className="grid grid-cols-2 gap-2 pt-1 text-xs sm:text-sm">
            <div>
              <span className="text-muted-foreground">Matching Enrolled:</span>{" "}
              <span className="font-semibold text-foreground">
                {effectivePreview.totalMatchingStudents}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Already Charged:</span>{" "}
              <span className="font-semibold text-foreground">
                {effectivePreview.alreadyObligatedCount}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">New Obligations:</span>{" "}
              <span className="font-semibold text-primary">
                {effectivePreview.newObligationsCount}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Total New Amount:</span>{" "}
              <span className="font-semibold text-foreground">
                {currencyFormatter.format(effectivePreview.totalNewAmount)}
              </span>
            </div>
          </div>
        )}

        {effectivePreview && effectivePreview.alreadyObligatedCount > 0 && (
          <p className="text-xs text-muted-foreground pt-1">
            Note: {effectivePreview.alreadyObligatedCount} student{effectivePreview.alreadyObligatedCount === 1 ? "" : "s"} will be skipped because they already have this fee obligation recorded for this semester.
          </p>
        )}

        {effectivePreview && effectivePreview.newObligationsCount === 0 && (
          <p className="text-xs font-medium text-amber-600 dark:text-amber-500 pt-1">
            All students in the selected audience already have this fee obligation. No new records will be created.
          </p>
        )}
      </div>

      <DialogFooter className="flex-col-reverse sm:flex-row gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handlePublish}
          disabled={
            isPending ||
            isPreviewLoading ||
            !selectedFeeId ||
            selectedYears.length === 0 ||
            selectedStatuses.length === 0 ||
            effectivePreview?.newObligationsCount === 0
          }
        >
          {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Publish {effectivePreview ? `(${effectivePreview.newObligationsCount} students)` : "Fee"}
        </Button>
      </DialogFooter>
    </div>
  );
}
