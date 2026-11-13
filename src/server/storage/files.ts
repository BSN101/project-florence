import "server-only";

import type { Workspace } from "@/features/access/access-policy";
import { requireWorkspace } from "@/server/auth/require-workspace";
import { createCommandClient } from "@/server/db/command-client";

import { filePurposes, processUpload, UploadRejectedError, type FilePurpose } from "./process";
import { deleteObject, putObject, signedGetUrl } from "./r2";

export { UploadRejectedError, type FilePurpose };

// Workspace gate only; register_file re-checks the exact role per purpose.
const uploaderWorkspace: Record<FilePurpose, Workspace> = {
  roster_import: "council", payment_proof: "student", payment_account_qr: "council",
};

/**
 * Validates, compresses and stores one private file, then records it. Returns the file id
 * for the owning feature's own command (roster import, payment account, payment).
 * Reusing `requestKey` on retry targets the same object and replays the registration.
 * Throws UploadRejectedError with a user-safe message for bad files or missing permission.
 */
export async function uploadFile(purpose: FilePurpose, file: File, requestKey: string): Promise<string> {
  const actor = await requireWorkspace(uploaderWorkspace[purpose]).catch(() => {
    throw new UploadRejectedError("You are not permitted to upload this file.");
  });
  const rules = filePurposes[purpose];
  if (file.size > rules.maxBytes) throw new UploadRejectedError(`The file is larger than ${rules.maxBytes / 1024 / 1024} MB.`);
  const body = await processUpload(purpose, new Uint8Array(await file.arrayBuffer()));
  const key = `${purpose}/${actor.profile.id}/${requestKey}.${rules.ext}`;

  await putObject(key, body, rules.mediaType);
  const { data, error } = await createCommandClient().rpc("register_file", {
    p_key: requestKey, p_actor: actor.profile.id, p_purpose: purpose, p_storage_key: key,
    p_media_type: rules.mediaType, p_byte_size: body.byteLength,
  });
  if (error) {
    // A reused key means the object belongs to the earlier registration; keep it.
    if (!error.message.includes("Request key reused")) await deleteObject(key).catch(() => {});
    if (error.code === "42501") throw new UploadRejectedError("You are not permitted to upload this file.");
    if (error.code === "22023") throw new UploadRejectedError("The file couldn't be saved. Try again.");
    throw new Error("File registration failed");
  }
  // shortcut: files never attached to a roster import, account or payment stay stored. `files` is append-only,
  // so a later cleanup can remove only the R2 objects, never the rows; add one if storage volume grows.
  return (data as { file_id: string }).file_id;
}

/** Short-lived link for a file the signed-in user may read, or null. Never log the result. */
export async function getDownloadUrl(fileId: string, workspace: Workspace): Promise<string | null> {
  const actor = await requireWorkspace(workspace);
  const { data, error } = await createCommandClient().rpc("file_download_key", { p_actor: actor.profile.id, p_file: fileId });
  if (error) throw new Error("File access check failed");
  const file = data[0];
  if (!file) return null;
  return signedGetUrl(file.storage_key, file.purpose === "roster_import" ? { download: "roster.csv" } : {});
}
