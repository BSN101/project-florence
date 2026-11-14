import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

import sharp from "sharp";

import { processUpload, UploadRejectedError } from "./process.ts";

const require = createRequire(import.meta.url);
const jsQR = require("jsqr");
const QRCode = require("qrcode");

// A noisy 4000x3000 "phone photo" with EXIF (including GPS-like data) and orientation 6.
async function photo() {
  const noise = Buffer.alloc(400 * 300 * 3);
  for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) >>> 24;
  return sharp(noise, { raw: { width: 400, height: 300, channels: 3 } }).resize(4000, 3000, { kernel: "nearest" })
    .withMetadata({ orientation: 6, exif: { IFD0: { Make: "TestPhone" }, GPS: { GPSLatitudeRef: "N" } } })
    .jpeg({ quality: 85 }).toBuffer();
}

test("proof photos are re-encoded as WebP, at most 2000 px, upright, smaller and without metadata", async () => {
  const input = await photo();
  const out = await processUpload("payment_proof", new Uint8Array(input));
  const meta = await sharp(out).metadata();
  assert.equal(meta.format, "webp");
  // Orientation 6 means rotated 90°: the 4000x3000 photo becomes portrait 1500x2000.
  assert.deepEqual([meta.width, meta.height], [1500, 2000]);
  assert.ok(out.byteLength < input.byteLength, `${out.byteLength} >= ${input.byteLength}`);
  assert.equal(meta.exif, undefined);
  assert.equal(meta.orientation, undefined);
});

test("small screenshot text stays readable enough to keep its contrast", async () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="200"><rect width="100%" height="100%" fill="white"/>
    <text x="10" y="60" font-size="14" font-family="sans-serif">Ref No. 1023 4567 8910 · PHP 40.00 · 13 Nov 2026</text></svg>`;
  const input = await sharp(Buffer.from(svg)).png().toBuffer();
  const out = await processUpload("payment_proof", new Uint8Array(input));
  const { channels } = await sharp(out).stats();
  // Dark text pixels survive (min near black), background stays white.
  assert.ok(channels[0].min < 80, `darkest pixel ${channels[0].min}`);
  assert.ok(channels[0].max > 240);
});

test("payment-account QR codes stay scannable after compression", async () => {
  const input = await QRCode.toBuffer("00020101021127600011ph.ppmi.p2m0111GXCHPHM2XXX", { width: 1600, margin: 4 });
  const out = await processUpload("payment_account_qr", new Uint8Array(input));
  const { data, info } = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal((await sharp(out).metadata()).format, "png");
  assert.ok(info.width <= 1024);
  assert.equal(jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data, "00020101021127600011ph.ppmi.p2m0111GXCHPHM2XXX");
});

// A QR on a gradient with a coloured logo, exported as a JPEG screenshot, like an e-wallet "save QR" image.
async function qrScreenshot(text, quality = 85) {
  const W = 1080, H = 1920, bg = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3; bg[i] = 0; bg[i + 1] = 90 + Math.round((y * 100) / H); bg[i + 2] = 200 + Math.round((x * 55) / W);
  }
  const qr = await QRCode.toBuffer(text, { width: 800, margin: 4, errorCorrectionLevel: "H" });
  const logo = await sharp({ create: { width: 140, height: 140, channels: 3, background: "#0b5cff" } }).png().toBuffer();
  return sharp(bg, { raw: { width: W, height: H, channels: 3 } })
    .composite([{ input: qr, left: 140, top: 560 }, { input: logo, left: 470, top: 890 }])
    .jpeg({ quality }).toBuffer();
}

async function decodeQr(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data;
}

test("a JPEG QR screenshot is not stored larger than uploaded and still scans", async () => {
  const text = "00020101021127600011ph.ppmi.p2m0111GXCHPHM2XXX";
  const input = await qrScreenshot(text);
  const out = await processUpload("payment_account_qr", new Uint8Array(input));
  assert.equal((await sharp(out).metadata()).format, "png");
  assert.ok(out.byteLength <= input.byteLength, `${out.byteLength} > ${input.byteLength}`);
  assert.equal(await decodeQr(out), text);
});

test("a heavily compressed QR screenshot falls back to fewer colours and still scans", async () => {
  const text = "00020101021127600011ph.ppmi.p2m0111GXCHPHM2XXX";
  // At quality 5 the JPEG is small enough that only the 16-colour step fits under it.
  const input = await qrScreenshot(text, 5);
  const out = await processUpload("payment_account_qr", new Uint8Array(input));
  assert.ok(out.byteLength <= input.byteLength, `${out.byteLength} > ${input.byteLength}`);
  assert.equal(await decodeQr(out), text);
});

test("non-images, oversized files and decompression bombs are refused", async () => {
  await assert.rejects(processUpload("payment_proof", new TextEncoder().encode("not an image")), UploadRejectedError);
  await assert.rejects(processUpload("payment_proof", new Uint8Array(4 * 1024 * 1024 + 1)), /larger than 4 MB/);
  await assert.rejects(processUpload("payment_account_qr", new Uint8Array(2 * 1024 * 1024 + 1)), /larger than 2 MB/);
  const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "red" } }).gif().toBuffer();
  await assert.rejects(processUpload("payment_proof", new Uint8Array(gif)), /JPEG, PNG or WebP/);
  // 10000x10000 = 100 MP, compresses to a tiny PNG.
  const bomb = await sharp({ create: { width: 10000, height: 10000, channels: 3, background: "black" } }).png().toBuffer();
  assert.ok(bomb.byteLength < 2 * 1024 * 1024);
  await assert.rejects(processUpload("payment_proof", new Uint8Array(bomb)), UploadRejectedError);
});

test("roster CSV is stored as is but must be UTF-8 text", async () => {
  const csv = new TextEncoder().encode("university_id,first_name\n22-1-00001,Ana\n");
  assert.deepEqual(await processUpload("roster_import", csv), csv);
  await assert.rejects(processUpload("roster_import", new Uint8Array([0x41, 0x00, 0x42])), /UTF-8 CSV/);
  await assert.rejects(processUpload("roster_import", new Uint8Array([0xff, 0xfe, 0x41])), /UTF-8 CSV/);
  await assert.rejects(processUpload("roster_import", new Uint8Array(0)), /empty/);
});
