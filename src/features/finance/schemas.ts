import { z } from "zod";

const definitionName = z
  .string()
  .trim()
  .min(1, "Name cannot be empty")
  .max(100, "Name cannot exceed 100 characters");

const definitionAmount = z.coerce
  .number("Amount must be a number")
  .positive("Amount must be greater than zero")
  .max(9999999.99, "Amount exceeds maximum permitted value")
  .refine(
    (val) => Number.isFinite(val) && /^\d+(?:\.\d{1,2})?$/.test(String(val)),
    { message: "Amount can have at most 2 decimal places" }
  );

const definitionId = z.string().uuid("Invalid definition identifier");

// Fee and fine definitions share identical validation rules.
export const createDefinitionSchema = z.object({
  name: definitionName,
  amount: definitionAmount,
});

export const updateDefinitionSchema = z.object({
  id: definitionId,
  name: definitionName,
  amount: definitionAmount,
});

export const archiveDefinitionSchema = z.object({
  id: definitionId,
});

export type CreateDefinitionInput = z.infer<typeof createDefinitionSchema>;
export type UpdateDefinitionInput = z.infer<typeof updateDefinitionSchema>;
export type ArchiveDefinitionInput = z.infer<typeof archiveDefinitionSchema>;
