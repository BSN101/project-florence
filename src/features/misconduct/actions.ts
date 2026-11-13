"use server";

import { guarded, invalid, requirePlatformAdmin, runCommand } from "@/features/access/provisioning-service";

import { archiveMisconductOptionSchema, saveMisconductOptionSchema } from "./schemas";

const page = "/admin/misconduct-catalog";

export async function saveMisconductOptionAction(input: unknown) {
  return guarded(async () => {
    const actor = await requirePlatformAdmin();
    const parsed = saveMisconductOptionSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const { requestKey, optionId, label } = parsed.data;
    const { failure } = await runCommand("save_misconduct_option",
      { p_key: requestKey, p_actor: actor.profile.id, p_option: optionId, p_label: label }, page);
    return failure ?? { success: true, message: optionId ? "Option updated. Existing demerits keep their original wording." : "Option added." };
  });
}

export async function archiveMisconductOptionAction(input: unknown) {
  return guarded(async () => {
    const actor = await requirePlatformAdmin();
    const parsed = archiveMisconductOptionSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const { failure } = await runCommand("archive_misconduct_option",
      { p_key: parsed.data.requestKey, p_actor: actor.profile.id, p_option: parsed.data.optionId }, page);
    return failure ?? { success: true, message: "Option archived. Existing demerits are unchanged." };
  });
}
