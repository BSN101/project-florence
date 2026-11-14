// Browser-side shrink before upload: saves mobile data and keeps phone photos under the
// server limits. The server re-compresses anyway, so this is a saving, not a security check.

export type ImageUploadPurpose = "payment_proof" | "payment_account_qr";

/** Largest original accepted on the phone before compression. */
export const MAX_ORIGINAL_BYTES = 15 * 1024 * 1024;

const serverFormats = new Set(["image/jpeg", "image/png", "image/webp"]);

const settings = {
  payment_proof: { maxEdge: 2000, type: "image/jpeg", quality: 0.8 },
  payment_account_qr: { maxEdge: 1024, type: "image/png", quality: undefined },
} as const;

/** Returns a resized JPEG (proof) or PNG (QR), or the original if the browser can't decode it. */
export async function compressImage(file: File, purpose: ImageUploadPurpose): Promise<File> {
  if (file.size > MAX_ORIGINAL_BYTES) throw new Error("The image is larger than 15 MB.");
  const { maxEdge, type, quality } = settings[purpose];
  let bitmap: ImageBitmap;
  try {
    // Applies EXIF orientation; decodes HEIC where the browser supports it (iOS Safari).
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file; // The server decides whether it's acceptable.
  }
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) { bitmap.close(); return file; }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  // Keep a smaller original the server accepts as is; it re-encodes anyway. Others (e.g. HEIC) must be converted.
  if (!blob || (blob.size >= file.size && serverFormats.has(file.type))) return file;
  return new File([blob], file.name.replace(/\.[^.]*$/, "") + (type === "image/png" ? ".png" : ".jpg"), { type });
}
