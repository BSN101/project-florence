import { z } from "zod";

export const semesterFilterSchema = z.object({
  semester: z.string().uuid().optional(),
});

export type SemesterFilterInput = z.infer<typeof semesterFilterSchema>;
