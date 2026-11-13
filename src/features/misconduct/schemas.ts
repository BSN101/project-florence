import { z } from "zod";

const requestKey = z.string().uuid();
const optionId = z.string().uuid();

/** Same limits as the database (trimmed, 1–200 characters). */
export const misconductLabel = z.string().trim().min(1, "Enter a label.").max(200, "Keep the label to 200 characters or fewer.");

/** No optionId creates a new option; otherwise renames it. */
export const saveMisconductOptionSchema = z.object({ requestKey, optionId: optionId.nullable(), label: misconductLabel });
export const archiveMisconductOptionSchema = z.object({ requestKey, optionId });

export type SaveMisconductOptionInput = z.infer<typeof saveMisconductOptionSchema>;
export type ArchiveMisconductOptionInput = z.infer<typeof archiveMisconductOptionSchema>;
