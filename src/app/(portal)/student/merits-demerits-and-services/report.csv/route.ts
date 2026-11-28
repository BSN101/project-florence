import type { NextRequest } from "next/server";

import { serializeDisciplinaryReportCsv } from "@/features/discipline/report-csv";
import { serveReportDownload } from "@/features/discipline/report-download";
import { formatManilaDate, formatManilaDateTime } from "@/lib/manila-date";

export async function GET(request: NextRequest) {
  return serveReportDownload(request.nextUrl.searchParams, {
    extension: "csv",
    contentType: "text/csv; charset=utf-8",
    render: (report) =>
      serializeDisciplinaryReportCsv(report, {
        formatDate: formatManilaDate,
        formatDateTime: formatManilaDateTime,
      }),
  });
}
