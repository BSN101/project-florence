import QRCode from "qrcode";

export const STUDENT_NUMBER_REGEX = /^[0-9]{2}-1-[0-9]{5}$/;

/**
 * Builds and validates the attendance QR code payload.
 *
 * Security Invariant (FL-012):
 * The QR code payload contains strictly the student's university_id in XX-1-XXXXX format.
 * NEVER encode contact numbers, emails, passwords, tokens, or session claims.
 * QR possession is an identifier resolved server-side by scanner operations, NOT authentication.
 */
export function buildAttendanceQrPayload(universityId: string): string {
  const trimmed = typeof universityId === "string" ? universityId.trim() : "";
  if (!STUDENT_NUMBER_REGEX.test(trimmed)) {
    throw new Error("Invalid student number for attendance QR generation. Must match XX-1-XXXXX.");
  }
  return trimmed;
}

/**
 * Generates a high-contrast attendance QR code PNG Data URL.
 * Rendered with dark modules on an opaque white background for scanner readability.
 */
export async function generateAttendanceQrDataUrl(universityId: string): Promise<string> {
  const payload = buildAttendanceQrPayload(universityId);
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 320,
    color: {
      dark: "#000000",
      light: "#ffffff",
    },
  });
}
