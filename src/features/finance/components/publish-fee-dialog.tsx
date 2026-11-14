"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Loader2, Users } from "lucide-react";

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
  const [selectedFeeId, setSelectedFeeId] = useState<string>(
    initialDefinitionId ?? definitions[0]?.id ?? ""
  );
  const [selectedYears, setSelectedYears] = useState<YearLevel[]>([1, 2, 3, 4]);
  const [selectedStatuses, setSelectedStatuses] = useState<AcademicStatus[]>([
    "regular",
    "irregular",
  ]);
  const [preview, setPreview] = useState<FeePublicationPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  useEffect(() => {
    if (initialDefinitionId) {
      setSelectedFeeId(initialDefinitionId);
    } else if (definitions.length > 0 && !selectedFeeId) {
      setSelectedFeeId(definitions[0].id);
    }
  }, [initialDefinitionId, definitions, selectedFeeId]);

  useEffect(() => {
    if (!isOpen || !selectedFeeId || !semesterId) return;
    if (selectedYears.length === 0 || selectedStatuses.length === 0) {
      setPreview(null);
      return;
    }

    let active = true;
    setIsPreviewLoading(true);
    setPreviewError(null);

    previewFeeAudience({
      feeDefinitionId: selectedFeeId,
      semesterId,
      yearLevels: selectedYears,
      academicStatuses: selectedStatuses,
    }).then((res) => {
      if (!active) return;
      setIsPreviewLoading(false);
      if (res.success) {
        setPreview(res.preview);
        setPreviewError(null);
      } else {
        setPreview(null);
        setPreviewError(res.error);
      }
    });

    return () => {
      active = false;
    };
  }, [isOpen, selectedFeeId, semesterId, selectedYears, selectedStatuses]);

  const selectedFee = definitions.find((d) => d.id === selectedFeeId);

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
      });

      if (!res.success) {
        setSubmitError(res.error);
        return;
      }

      onClose();
    });
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isPending) onClose();
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
              onChange={(e) => setSelectedFeeId(e.target.value)}
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
                    onChange={() => setSelectedYears(toggle(selectedYears, year))}
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
                    onChange={() => setSelectedStatuses(toggle(selectedStatuses, status))}
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

            {previewError && (
              <p className="text-xs text-destructive">{previewError}</p>
            )}

            {preview && !isPreviewLoading && (
              <div className="grid grid-cols-2 gap-2 pt-1 text-xs sm:text-sm">
                <div>
                  <span className="text-muted-foreground">Matching Enrolled:</span>{" "}
                  <span className="font-semibold text-foreground">
                    {preview.totalMatchingStudents}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Already Charged:</span>{" "}
                  <span className="font-semibold text-foreground">
                    {preview.alreadyObligatedCount}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">New Obligations:</span>{" "}
                  <span className="font-semibold text-primary">
                    {preview.newObligationsCount}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Total New Amount:</span>{" "}
                  <span className="font-semibold text-foreground">
                    {currencyFormatter.format(preview.totalNewAmount)}
                  </span>
                </div>
              </div>
            )}

            {preview && preview.alreadyObligatedCount > 0 && (
              <p className="text-xs text-muted-foreground pt-1">
                Note: {preview.alreadyObligatedCount} student{preview.alreadyObligatedCount === 1 ? "" : "s"} will be skipped because they already have this fee obligation recorded for this semester.
              </p>
            )}

            {preview && preview.newObligationsCount === 0 && (
              <p className="text-xs font-medium text-amber-600 dark:text-amber-500 pt-1">
                All students in the selected audience already have this fee obligation. No new records will be created.
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
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
              preview?.newObligationsCount === 0
            }
          >
            {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Publish {preview ? `(${preview.newObligationsCount} students)` : "Fee"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

