import "server-only";

import { AwsClient } from "aws4fetch";

// Private bucket access. Callers pass server-built keys only; never log keys or signed URLs.
let client: AwsClient | undefined;
function r2() {
  const { R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET_NAME } = process.env;
  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ENDPOINT || !R2_BUCKET_NAME) throw new Error("R2 storage is not configured");
  client ??= new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, service: "s3", region: "auto" });
  return { client, base: `${R2_ENDPOINT.replace(/\/+$/, "")}/${R2_BUCKET_NAME}` };
}

const objectUrl = (base: string, key: string) => `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;

export async function putObject(key: string, body: Uint8Array, mediaType: string) {
  const { client, base } = r2();
  const response = await client.fetch(objectUrl(base, key), {
    method: "PUT", body: body as BodyInit, headers: { "content-type": mediaType, "content-length": String(body.byteLength) },
  });
  if (!response.ok) throw new Error(`R2 upload failed (${response.status})`);
}

export async function deleteObject(key: string) {
  const { client, base } = r2();
  const response = await client.fetch(objectUrl(base, key), { method: "DELETE" });
  if (!response.ok && response.status !== 404) throw new Error(`R2 delete failed (${response.status})`);
}

/** Short-lived GET link. `download` forces a save dialog with that filename. */
export async function signedGetUrl(key: string, { seconds = 300, download }: { seconds?: number; download?: string } = {}) {
  const { client, base } = r2();
  const url = new URL(objectUrl(base, key));
  url.searchParams.set("X-Amz-Expires", String(seconds));
  if (download) url.searchParams.set("response-content-disposition", `attachment; filename="${download.replace(/[^\w.-]/g, "_")}"`);
  const signed = await client.sign(url.toString(), { method: "GET", aws: { signQuery: true } });
  return signed.url;
}
