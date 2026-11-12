"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FineDefinitionDTO } from "@/features/finance/contracts";
import { saveEvent } from "../actions";
import type { EventDTO, EventRulesDTO } from "../contracts";
import { ACADEMIC_STATUSES, YEAR_LEVELS, isoToManilaInput, manilaInputToIso } from "../schemas";

const NO_FINE = "none";

function initialState(event: EventDTO | null, rules: EventRulesDTO | null) {
  return {
    name: event?.name ?? "",
    venue: event?.venue ?? "",
    startsAt: isoToManilaInput(event?.starts_at ?? null),
    endsAt: isoToManilaInput(event?.ends_at ?? null),
    timeInFrom: isoToManilaInput(event?.time_in_from ?? null),
    lateAfterMinutes: String(event?.late_after_minutes ?? 15),
    yearLevels: event?.year_levels ?? [...YEAR_LEVELS],
    academicStatuses: (event?.academic_statuses ?? [...ACADEMIC_STATUSES]) as string[],
    absenceFineId: rules?.absence_fine_definition_id ?? NO_FINE,
    lateFineId: rules?.late_fine_definition_id ?? NO_FINE,
    absenceDemeritDays: String(rules?.absence_demerit_days ?? 0),
    lateDemeritDays: String(rules?.late_demerit_days ?? 0),
    requiresTimeOut: rules?.requires_time_out ?? false,
  };
}

function toggle<T>(list: T[], value: T) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/** Create or edit an event. Published events allow only name/venue changes. */
export function EventFormDialog({
  isOpen,
  onClose,
  semesterId,
  event,
  rules,
  fines,
}: {
  isOpen: boolean;
  onClose: () => void;
  semesterId: string;
  event: EventDTO | null;
  rules: EventRulesDTO | null;
  fines: FineDefinitionDTO[];
}) {
  const [form, setForm] = useState(() => initialState(event, rules));
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();
  const frozen = event?.audience_frozen_at != null;
  const locked = isPending || frozen;
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIssues({});
    startTransition(async () => {
      const result = await saveEvent({
        id: event?.id ?? null,
        semesterId: event?.semester_id ?? semesterId,
        name: form.name,
        venue: form.venue,
        startsAt: manilaInputToIso(form.startsAt) ?? "",
        endsAt: manilaInputToIso(form.endsAt) ?? "",
        timeInFrom: manilaInputToIso(form.timeInFrom) ?? "",
        lateAfterMinutes: form.lateAfterMinutes,
        yearLevels: form.yearLevels,
        academicStatuses: form.academicStatuses as (typeof ACADEMIC_STATUSES)[number][],
        absenceFineId: form.absenceFineId === NO_FINE ? null : form.absenceFineId,
        lateFineId: form.lateFineId === NO_FINE ? null : form.lateFineId,
        absenceDemeritDays: form.absenceDemeritDays,
        lateDemeritDays: form.lateDemeritDays,
        requiresTimeOut: form.requiresTimeOut,
      });
      if (!result.success) {
        setError(result.error);
        setIssues(result.issues ?? {});
        return;
      }
      onClose();
    });
  }

  const fieldError = (key: string) =>
    issues[key]?.[0] ? <p className="mt-1 text-xs text-destructive">{issues[key][0]}</p> : null;

  const dateField = (key: "startsAt" | "endsAt" | "timeInFrom", label: string) => (
    <div>
      <label htmlFor={`event-${key}`} className="mb-1 block text-xs font-medium text-foreground">{label}</label>
      <Input id={`event-${key}`} type="datetime-local" value={form[key]} required
        onChange={(e) => set(key, e.target.value)} disabled={locked} />
      {fieldError(key)}
    </div>
  );

  const fineItems = [
    { value: NO_FINE, label: "No fine" },
    ...fines.map((fine) => ({ value: fine.id, label: `${fine.name} (₱${fine.amount.toFixed(2)})` })),
  ];

  const fineField = (key: "absenceFineId" | "lateFineId", label: string) => (
    <div>
      <label htmlFor={`event-${key}`} className="mb-1 block text-xs font-medium text-foreground">{label}</label>
      <Select items={fineItems} value={form[key]} onValueChange={(value) => set(key, (value as string) ?? NO_FINE)} disabled={locked}>
        <SelectTrigger id={`event-${key}`} className="w-full"><SelectValue placeholder="No fine" /></SelectTrigger>
        <SelectContent>
          {fineItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  const numberField = (key: "lateAfterMinutes" | "absenceDemeritDays" | "lateDemeritDays", label: string) => (
    <div>
      <label htmlFor={`event-${key}`} className="mb-1 block text-xs font-medium text-foreground">{label}</label>
      <Input id={`event-${key}`} type="number" min="0" step="1" value={form[key]} required
        onChange={(e) => set(key, e.target.value)} disabled={locked} />
      {fieldError(key)}
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isPending) onClose(); }}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{event ? (frozen ? "Event details" : "Edit event") : "New event"}</DialogTitle>
          <DialogDescription>
            {frozen
              ? "This event is published. Its audience, attendance windows and consequences are frozen; only the name and venue can change."
              : "Times are in Philippine time. The audience, windows and consequences freeze when the event is published."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="event-name" className="mb-1 block text-xs font-medium text-foreground">Name</label>
              <Input id="event-name" value={form.name} onChange={(e) => set("name", e.target.value)}
                required maxLength={150} disabled={isPending} />
              {fieldError("name")}
            </div>
            <div>
              <label htmlFor="event-venue" className="mb-1 block text-xs font-medium text-foreground">Venue (optional)</label>
              <Input id="event-venue" value={form.venue} onChange={(e) => set("venue", e.target.value)}
                maxLength={150} disabled={isPending} />
            </div>
            {dateField("startsAt", "Starts")}
            {dateField("endsAt", "Ends")}
          </div>

          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-semibold text-foreground">Attendance</legend>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Time-in and time-out can be recorded from when time-in opens until the event ends. Arrivals after the
              late threshold count as late; students with no time-in count as absent.
            </p>
            {dateField("timeInFrom", "Time-in opens")}
            {numberField("lateAfterMinutes", "Late after (minutes from time-in opening)")}
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
              <input type="checkbox" checked={form.requiresTimeOut} disabled={locked}
                onChange={(e) => set("requiresTimeOut", e.target.checked)} />
              Missing time-out counts as absent
            </label>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold text-foreground">Audience</legend>
            <div className="flex flex-wrap gap-4 text-sm text-foreground">
              {YEAR_LEVELS.map((year) => (
                <label key={year} className="flex items-center gap-2">
                  <input type="checkbox" checked={form.yearLevels.includes(year)} disabled={locked}
                    onChange={() => set("yearLevels", toggle(form.yearLevels, year))} />
                  Year {year}
                </label>
              ))}
            </div>
            {fieldError("yearLevels")}
            <div className="flex flex-wrap gap-4 text-sm text-foreground">
              {ACADEMIC_STATUSES.map((status) => (
                <label key={status} className="flex items-center gap-2 capitalize">
                  <input type="checkbox" checked={form.academicStatuses.includes(status)} disabled={locked}
                    onChange={() => set("academicStatuses", toggle(form.academicStatuses, status))} />
                  {status}
                </label>
              ))}
            </div>
            {fieldError("academicStatuses")}
          </fieldset>

          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-semibold text-foreground">Consequences</legend>
            {fineField("absenceFineId", "Absence fine")}
            {numberField("absenceDemeritDays", "Absence demerit days")}
            {fineField("lateFineId", "Late fine")}
            {numberField("lateDemeritDays", "Late demerit days")}
            {frozen && (rules?.absence_fine_amount != null || rules?.late_fine_amount != null) && (
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Frozen amounts: absence {rules?.absence_fine_amount != null ? `₱${rules.absence_fine_amount.toFixed(2)}` : "none"},
                late {rules?.late_fine_amount != null ? `₱${rules.late_fine_amount.toFixed(2)}` : "none"}.
              </p>
            )}
          </fieldset>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="size-4 animate-spin" />}
              {event ? "Save changes" : "Create event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
