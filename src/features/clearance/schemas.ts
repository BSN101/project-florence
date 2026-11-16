import { z } from "zod";

export const confirmCouncilClearanceSchema = z.object({
  studentId: z.string().uuid("Invalid student ID format"),
  semesterId: z.string().uuid("Invalid semester ID format"),
});

export type ConfirmCouncilClearanceInput = z.infer<typeof confirmCouncilClearanceSchema>;
