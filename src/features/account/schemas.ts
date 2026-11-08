import { z } from "zod";

import { passwordSchema } from "../../lib/validation/password.mjs";

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: passwordSchema,
  confirmation: z.string(),
}).superRefine((input, context) => {
  if (input.newPassword !== input.confirmation) {
    context.addIssue({
      code: "custom",
      path: ["confirmation"],
      message: "Passwords must match",
    });
  }
  if (input.newPassword === input.currentPassword) {
    context.addIssue({
      code: "custom",
      path: ["newPassword"],
      message: "New password must differ from the current password",
    });
  }
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
