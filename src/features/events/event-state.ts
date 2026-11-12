import type { EventDTO } from "./contracts";

/** Capture needs a published, unarchived event whose attendance is not yet locked. */
export function canCapture(event: EventDTO) {
  return event.audience_frozen_at !== null && event.archived_at === null && event.attendance_locked_at === null;
}
