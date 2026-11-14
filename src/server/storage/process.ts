// No secrets here (and sharp can't run in a browser), so no server-only marker: node --test imports it.
import sharp from "sharp";

export type FilePurpose = "roster_import" | "payment_proof" | "payment_account_qr";

/** Upload rules per purpose. `maxBytes` is the request limit; stored files are re-encoded and smaller. */
export const filePurposes = {
  roster_import: { maxBytes: 1024 * 1024, ext: "csv", mediaType: "text/csv" },
  payment_proof: { maxBytes: 4 * 1024 * 1024, ext: "webp", mediaType: "image/webp" },
  payment_account_qr: { maxBytes: 2 * 1024 * 1024, ext: "png", mediaType: "image/png" },
} as const satisfies Record<FilePurpose, { maxBytes: number; ext: string; mediaType: string }>;

export class UploadRejectedError extends Error {}

type Encode = (image: ReturnType<typeof sharp>) => ReturnType<typeof sharp>;

// Best quality first. Re-encoding can grow an already-compressed upload, so later steps trade quality for size.
// Dithering stays off: it scatters noise that compresses badly and adds nothing to a QR's hard edges.
const encodings: Record<"payment_proof" | "payment_account_qr", Encode[]> = {
  payment_proof: [(i) => i.webp({ quality: 80 })],
  payment_account_qr: [256, 64, 16].map((colours): Encode => (i) => i.png({ compressionLevel: 9, palette: true, colours, dither: 0 })),
};

/** First encoding no larger than the upload; if none is, the smallest. Always re-encodes, so metadata never survives. */
async function smallestEncoding(image: ReturnType<typeof sharp>, steps: Encode[], inputBytes: number): Promise<Uint8Array> {
  let smallest: Buffer | undefined;
  for (const encode of steps) {
    const out = await encode(image.clone()).toBuffer();
    if (out.byteLength <= inputBytes) return new Uint8Array(out);
    if (!smallest || out.byteLength < smallest.byteLength) smallest = out;
  }
  return new Uint8Array(smallest!);
}

const imageFormats = new Set(["jpeg", "png", "webp"]);
// Decompression-bomb guard: refuse images that decode to more than 40 megapixels.
const maxPixels = 40_000_000;

/** Validates by content (not the browser's label) and re-encodes images; returns the bytes to store. */
export async function processUpload(purpose: FilePurpose, input: Uint8Array): Promise<Uint8Array> {
  const rules = filePurposes[purpose];
  if (input.byteLength === 0) throw new UploadRejectedError("The file is empty.");
  if (input.byteLength > rules.maxBytes) throw new UploadRejectedError(`The file is larger than ${rules.maxBytes / 1024 / 1024} MB.`);

  if (purpose === "roster_import") {
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(input); } catch { throw new UploadRejectedError("The roster must be a UTF-8 CSV file."); }
    if (text.includes("\u0000")) throw new UploadRejectedError("The roster must be a UTF-8 CSV file.");
    return input;
  }

  let image: ReturnType<typeof sharp>;
  try {
    image = sharp(input, { limitInputPixels: maxPixels, failOn: "error" });
    const { format } = await image.metadata();
    if (!format || !imageFormats.has(format)) throw new UploadRejectedError("Upload a JPEG, PNG or WebP image.");
  } catch (error) {
    if (error instanceof UploadRejectedError) throw error;
    throw new UploadRejectedError("Upload a JPEG, PNG or WebP image.");
  }

  // rotate() applies EXIF orientation; sharp drops all metadata (including GPS) by default.
  const upright = image.rotate();
  try {
    const resized = purpose === "payment_proof"
      ? upright.resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
      : upright.resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true });
    return await smallestEncoding(resized, encodings[purpose], input.byteLength);
  } catch {
    throw new UploadRejectedError("The image couldn't be processed. Try a different file.");
  }
}
