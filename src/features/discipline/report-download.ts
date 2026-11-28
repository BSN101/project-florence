import "server-only";

import { getAccessContext } from "@/server/auth/access-context";
import { AccessDeniedError } from "@/server/auth/require-workspace";

import { buildReportFilename, parseReportCsvParams } from "./report-calculations";
import type { StudentDisciplinaryReportData } from "./report-contracts";
import { getStudentDisciplinaryReportForAccess } from "./report-queries";

const TEXT_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

const text = (body: string, status: number) => new Response(body, { status, headers: TEXT_HEADERS });

/**
 * Serves the signed-in student's FL-045 report as a download (CSV or PDF). Handles session,
 * workspace and parameter checks; `render` only turns the authorized report into a file body.
 */
export async function serveReportDownload(
  searchParams: URLSearchParams,
  file: {
    extension: "csv" | "pdf";
    contentType: string;
    render: (report: StudentDisciplinaryReportData) => BodyInit | Promise<BodyInit>;
  }
): Promise<Response> {
  const access = await getAccessContext();
  if (access.status === "unauthenticated") return text("Authentication required.", 401);
  if (access.status === "error") return text("Unable to verify access. Try again later.", 503);
  if (access.status === "unavailable" || !access.workspaces.includes("student")) {
    return text("Student access required.", 403);
  }

  const params = parseReportCsvParams(searchParams);
  if (!params) return text("Invalid report parameters.", 400);

  try {
    const report = await getStudentDisciplinaryReportForAccess(
      access,
      params.scope === "semester"
        ? { scope: "semester", semesterId: params.semesterId }
        : { scope: "year", academicYearStart: params.academicYearStart },
      new Date()
    );
    if (!report) return text("Requested report period is unavailable.", 400);

    const filename = buildReportFilename({
      scope: report.scope,
      universityId: report.student.universityId,
      academicYearStart: report.academicYearStart,
      term: report.scope === "semester" ? (report.coveredTerms[0]?.term ?? null) : null,
    }).replace(/\.csv$/, `.${file.extension}`);

    return new Response(await file.render(report), {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) return text("Student access required.", 403);
    return text("Unable to generate disciplinary report.", 500);
  }
}
