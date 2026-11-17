import { paymentProofFileIdSchema } from "@/features/finance/schemas";
import { AccessDeniedError } from "@/server/auth/require-workspace";
import { getDownloadUrl } from "@/server/storage/files";

const headers = { "Cache-Control": "private, no-store" };

/**
 * Same-origin copy of the student's own receipt image, so "Save as photo" can draw it
 * on a canvas (a cross-origin R2 image would block canvas export). file_download_key
 * decides access; the signed URL never reaches the browser.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  if (!paymentProofFileIdSchema.safeParse(fileId).success) {
    return new Response(null, { status: 404, headers });
  }
  try {
    const url = await getDownloadUrl(fileId, "student");
    if (!url) return new Response(null, { status: 404, headers });
    const object = await fetch(url, { cache: "no-store" });
    if (!object.ok || !object.body) return new Response(null, { status: 502, headers });
    return new Response(object.body, {
      headers: { ...headers, "Content-Type": object.headers.get("content-type") ?? "image/webp" },
    });
  } catch (error) {
    return new Response(null, { status: error instanceof AccessDeniedError ? 403 : 500, headers });
  }
}
