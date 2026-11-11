import { z } from "zod";

const fineName = z
  .string()
  .trim()
  .min(1, "Name cannot be empty")
  .max(100, "Name cannot exceed 100 characters");

const fineAmount = z.coerce
  .number("Amount must be a number")
  .positive("Amount must be greater than zero")
  .max(9999999.99, "Amount exceeds maximum permitted value")
  .refine(
    (val) => Number.isFinite(val) && /^\d+(?:\.\d{1,2})?$/.test(String(val)),
    { message: "Amount can have at most 2 decimal places" }
  );

export const createFineDefinitionSchema = z.object({
  name: fineName,
  amount: fineAmount,
});

export const updateFineDefinitionSchema = z.object({
  id: z.string().uuid("Invalid fine definition identifier"),
  name: fineName,
  amount: fineAmount,
});

export const archiveFineDefinitionSchema = z.object({
  id: z.string().uuid("Invalid fine definition identifier"),
});

export type CreateFineDefinitionInput = z.infer<typeof createFineDefinitionSchema>;
export type UpdateFineDefinitionInput = z.infer<typeof updateFineDefinitionSchema>;
export type ArchiveFineDefinitionInput = z.infer<typeof archiveFineDefinitionSchema>;

