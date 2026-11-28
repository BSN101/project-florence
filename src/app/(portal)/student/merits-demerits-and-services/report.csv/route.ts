import type { NextRequest } from "next/server";

import {
  buildReportFilename,
  parseReportCsvParams,
} from "@/features/discipline/report-calculations";
import { serializeDisciplinaryReportCsv } from "@/features/discipline/report-csv";
import { getStudentDisciplinaryReportForAccess } from "@/features/discipline/report-queries";
import { formatManilaDate, formatManilaDateTime } from "@/lib/manila-date";
import { getAccessContext } from "@/server/auth/access-context";
import { AccessDeniedError } from "@/server/auth/require-workspace";

const TEXT_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

export async function GET(request: NextRequest) {
  const access = await getAccessContext();

  if (access.status === "unauthenticated") {
    return new Response("Authentication required.", {
      status: 401,
      headers: TEXT_HEADERS,
    });
  }

  if (access.status === "error") {
    return new Response("Unable to verify access. Try again later.", {
      status: 503,
      headers: TEXT_HEADERS,
    });
  }

  if (access.status === "unavailable" || !access.workspaces.includes("student")) {
    return new Response("Student access required.", {
      status: 403,
      headers: TEXT_HEADERS,
    });
  }

  const parsedParams = parseReportCsvParams(request.nextUrl.searchParams);
  if (!parsedParams) {
    return new Response("Invalid report parameters.", {
      status: 400,
      headers: TEXT_HEADERS,
    });
  }

  const snapshot = new Date();

  try {
    const report = await getStudentDisciplinaryReportForAccess(
      access,
      parsedParams.scope === "semester"
        ? { scope: "semester", semesterId: parsedParams.semesterId }
        : { scope: "year", academicYearStart: parsedParams.academicYearStart },
      snapshot
    );

    if (!report) {
      return new Response("Requested report period is unavailable.", {
        status: 400,
        headers: TEXT_HEADERS,
      });
    }

    const filename = buildReportFilename({
      scope: report.scope,
      universityId: report.student.universityId,
      academicYearStart: report.academicYearStart,
      term: report.scope === "semester" ? (report.coveredTerms[0]?.term ?? null) : null,
    });

    const csv = serializeDisciplinaryReportCsv(report, {
      formatDate: formatManilaDate,
      formatDateTime: formatManilaDateTime,
    });

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return new Response("Student access required.", {
        status: 403,
        headers: TEXT_HEADERS,
      });
    }
    return new Response("Unable to generate disciplinary report.", {
      status: 500,
      headers: TEXT_HEADERS,
    });
  }
}
