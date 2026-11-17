import type { PaymentRecordTone, PaymentRecordView } from "./payment-record";

// Browser-only: draws the payment record above the receipt image as one PNG.
// Canvas colours are fixed (light) so the saved photo looks the same in any theme.

const WIDTH = 1080;
const PAD = 64;
const INNER = WIDTH - PAD * 2;
const LABEL_COL = 260;

const toneColors: Record<PaymentRecordTone, { fg: string; bg: string }> = {
  pending: { fg: "#4338ca", bg: "#e0e7ff" },
  verified: { fg: "#047857", bg: "#d1fae5" },
  rejected: { fg: "#b91c1c", bg: "#fee2e2" },
  refunded: { fg: "#7e22ce", bg: "#f3e8ff" },
  superseded: { fg: "#475569", bg: "#e2e8f0" },
};

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  // Break on spaces, and inside long unbroken tokens (IDs, references) by character.
  for (const word of text.split(" ")) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    for (const char of word) {
      if (ctx.measureText(line + char).width > maxWidth && line) {
        lines.push(line);
        line = "";
      }
      line += char;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

/** Lays out (and, when `draw`, paints) the record; returns the height used. */
function layout(
  ctx: CanvasRenderingContext2D,
  view: PaymentRecordView,
  fonts: { body: string; mono: string },
  proof: ImageBitmap,
  draw: boolean
): number {
  const text = (value: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = "left") => {
    if (!draw) return;
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
  };
  const rule = (y: number) => {
    if (!draw) return;
    ctx.fillStyle = "#e5e7eb";
    ctx.fillRect(PAD, y, INNER, 2);
  };

  let y = PAD;
  text("FLORENCE", PAD, y + 28, `600 26px ${fonts.body}`, "#6b7280");
  y += 44;
  text(view.title, PAD, y + 44, `700 44px ${fonts.body}`, "#111827");
  y += 72;

  ctx.font = `600 28px ${fonts.body}`;
  const pillWidth = ctx.measureText(view.status.label).width + 48;
  if (draw) {
    const { fg, bg } = toneColors[view.status.tone];
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(PAD, y, pillWidth, 52, 26);
    ctx.fill();
    text(view.status.label, PAD + 24, y + 36, `600 28px ${fonts.body}`, fg);
  }
  y += 52 + 24;

  if (view.notice) {
    ctx.font = `500 26px ${fonts.body}`;
    for (const line of wrap(ctx, view.notice, INNER)) {
      text(line, PAD, y + 26, `500 26px ${fonts.body}`, "#92400e");
      y += 36;
    }
    y += 12;
  }

  rule(y);
  y += 28;

  for (const row of view.rows) {
    const font = row.mono ? `500 28px ${fonts.mono}` : `500 28px ${fonts.body}`;
    ctx.font = font;
    const lines = wrap(ctx, row.value, INNER - LABEL_COL);
    text(row.label, PAD, y + 30, `400 26px ${fonts.body}`, "#6b7280");
    lines.forEach((line, i) => text(line, PAD + LABEL_COL, y + 30 + i * 38, font, "#111827"));
    y += lines.length * 38 + 14;
  }

  if (view.items.length) {
    y += 8;
    rule(y);
    y += 28;
    text("Covered items", PAD, y + 26, `400 26px ${fonts.body}`, "#6b7280");
    y += 44;
    for (const item of view.items) {
      ctx.font = `400 28px ${fonts.body}`;
      const lines = wrap(ctx, item.label, INNER - 220);
      lines.forEach((line, i) => text(line, PAD, y + 30 + i * 38, `400 28px ${fonts.body}`, "#111827"));
      text(item.value, WIDTH - PAD, y + 30, `500 28px ${fonts.mono}`, "#111827", "right");
      y += lines.length * 38 + 10;
    }
  }

  y += 8;
  rule(y);
  y += 28;
  text("Total", PAD, y + 36, `600 30px ${fonts.body}`, "#111827");
  text(view.total, WIDTH - PAD, y + 38, `700 40px ${fonts.body}`, "#111827", "right");
  y += 72;

  rule(y);
  y += 32;
  text("Receipt image", PAD, y + 26, `400 26px ${fonts.body}`, "#6b7280");
  y += 48;
  const scale = Math.min(1, INNER / proof.width, 1800 / proof.height);
  const w = Math.round(proof.width * scale);
  const h = Math.round(proof.height * scale);
  if (draw) {
    ctx.fillStyle = "#f3f4f6";
    ctx.fillRect(PAD, y, INNER, h + 32);
    ctx.drawImage(proof, PAD + (INNER - w) / 2, y + 16, w, h);
  }
  y += h + 32 + PAD;
  return y;
}

/** Fetches the receipt image from the same-origin proof route and returns the composed PNG. */
export async function renderPaymentRecordImage(view: PaymentRecordView, proofFileId: string): Promise<Blob> {
  const response = await fetch(`/student/fees-and-fines/proof/${proofFileId}`, { cache: "no-store" });
  if (!response.ok) throw new Error("The receipt image could not be loaded.");
  const proof = await createImageBitmap(await response.blob());
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser cannot create images.");
    // Use the app's loaded fonts (next/font names are hashed, so read them from the page).
    const style = getComputedStyle(document.body);
    const fonts = {
      body: style.fontFamily || "sans-serif",
      mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    };
    await document.fonts.ready;
    canvas.width = WIDTH;
    canvas.height = layout(ctx, view, fonts, proof, false);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    layout(ctx, view, fonts, proof, true);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("The image could not be created.");
    return blob;
  } finally {
    proof.close();
  }
}

/**
 * Share sheet only on touch devices, where "Save Image" puts the photo in Photos.
 * Desktop browsers can share files too, but people there expect a plain download.
 */
export function prefersShareSheet(coarsePointer: boolean, canShareFile: boolean): boolean {
  return coarsePointer && canShareFile;
}

/** Opens the phone share sheet or downloads the PNG. */
export async function savePaymentRecordImage(blob: Blob, fileName: string): Promise<void> {
  const file = new File([blob], fileName, { type: "image/png" });
  const canShareFile = typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  if (prefersShareSheet(window.matchMedia("(pointer: coarse)").matches, canShareFile)) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      // Share failed for another reason: fall through to a download.
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
