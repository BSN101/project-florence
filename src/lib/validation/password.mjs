import { z } from "zod";

const encoder = new TextEncoder();

export const passwordSchema = z.string().superRefine((password, context) => {
  const byteLength = encoder.encode(password).length;
  if (byteLength < 12 || byteLength > 72) {
    context.addIssue({
      code: "custom",
      message: "Password must be between 12 and 72 UTF-8 bytes",
    });
  }
});
