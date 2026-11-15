import { z } from "zod";

import { getStudentDisciplinaryLedger } from "@/features/discipline/queries";
import { AccessDeniedError } from "@/server/auth/require-workspace";

const headers = { "Cache-Control": "private, no-store" };

/** Faculty student-dialog ledger (FL-029); RLS and the query scope what each instructor sees. */
export async function GET(_request: Request, { params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  if (!z.string().uuid().safeParse(studentId).success) {
    return Response.json({ error: "Invalid student" }, { status: 400, headers });
  }
  try {
    return Response.json(await getStudentDisciplinaryLedger(studentId), { headers });
  } catch (error) {
    const status = error instanceof AccessDeniedError ? 403 : 500;
    return Response.json({ error: "Unable to load disciplinary records" }, { status, headers });
  }
}
