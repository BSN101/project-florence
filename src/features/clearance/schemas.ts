import { z } from "zod";

export const confirmCouncilClearanceSchema = z.object({
  studentId: z.string().uuid("Invalid student ID format"),
  semesterId: z.string().uuid("Invalid semester ID format"),
  /** Made when the dialog opens, so a retry of the same confirmation replays instead of repeating. */
  requestKey: z.string().uuid("Invalid request key"),
});

export type ConfirmCouncilClearanceInput = z.infer<typeof confirmCouncilClearanceSchema>;
