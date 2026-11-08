import { z } from "zod";

import { passwordSchema } from "../../lib/validation/password.mjs";

const email = z.string().trim().max(254).email();

export const signInSchema = z.object({
  email,
  password: z.string().min(1).max(1024),
});

export const passwordResetRequestSchema = z.object({ email });

export const passwordRecoverySchema = z.object({
  password: passwordSchema,
  confirmation: z.string(),
}).refine((input) => input.password === input.confirmation, {
  path: ["confirmation"],
  message: "Passwords must match",
});

export type SignInInput = z.infer<typeof signInSchema>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type PasswordRecoveryInput = z.infer<typeof passwordRecoverySchema>;
