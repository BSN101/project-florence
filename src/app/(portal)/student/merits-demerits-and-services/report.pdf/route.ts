import type { NextRequest } from "next/server";

import { serveReportDownload } from "@/features/discipline/report-download";
import { renderDisciplinaryReportPdf } from "@/features/discipline/report-pdf";

export async function GET(request: NextRequest) {
  return serveReportDownload(request.nextUrl.searchParams, {
    extension: "pdf",
    contentType: "application/pdf",
    render: renderDisciplinaryReportPdf,
  });
}
