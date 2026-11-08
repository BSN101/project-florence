import { z } from "zod";

const email = z.string().trim().max(254).email();

export const signInSchema = z.object({
  email,
  password: z.string().min(1).max(1024),
});

export const passwordResetRequestSchema = z.object({ email });

export const updatePasswordSchema = z.object({
  password: z.string().min(12).max(72),
  confirmation: z.string(),
}).refine((input) => input.password === input.confirmation, {
  path: ["confirmation"],
  message: "Passwords must match",
});

export type SignInInput = z.infer<typeof signInSchema>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;
