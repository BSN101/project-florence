import { Card } from "@/components/ui/card";
import { formatManilaDate, formatManilaDateTime } from "@/lib/manila-date";

import type {
  StudentDisciplinaryReportDemeritRow,
  StudentDisciplinaryReportMeritRow,
  StudentDisciplinaryReportServiceCreditRow,
} from "../report-contracts";
import {
  BucketBadge,
  DemeritStatusBadge,
  MeritStatusBadge,
  ServiceCreditBadge,
} from "./disciplinary-badges";

const REPORT_THEAD_CLASS =
  "border-b border-border bg-muted/70 text-xs font-medium text-muted-foreground";

function formatMeritSourceText(source: "direct" | "endorsement" | "external_ci"): string {
  if (source === "endorsement") return "Council endorsement";
  if (source === "external_ci") return "External CI";
  return "Direct award";
}

export function StudentDisciplinaryReportTables({
  demerits,
  merits,
  serviceCredits,
  showTermColumn,
}: {
  demerits: readonly StudentDisciplinaryReportDemeritRow[];
  merits: readonly StudentDisciplinaryReportMeritRow[];
  serviceCredits: readonly StudentDisciplinaryReportServiceCreditRow[];
  showTermColumn: boolean;
}) {
  return (
    <div data-print-table-group className="flex w-full flex-col gap-6">
      {/* Demerits in Period */}
      <section data-print-table-section className="flex w-full flex-col gap-2">
        <div
          data-print-heading
          className="flex items-baseline justify-between gap-2 break-after-avoid"
        >
          <h3 className="section-title break-after-avoid">Demerits in Period</h3>
          <span className="text-xs text-muted-foreground tabular-nums">
            {demerits.length} {demerits.length === 1 ? "record" : "records"}
          </span>
        </div>

        {demerits.length === 0 ? (
          <Card
            data-print-avoid-break
            className="w-full p-6 text-center text-xs text-muted-foreground"
          >
            No demerit records in this period.
          </Card>
        ) : (
          <div
            data-print-scroll
            className="w-full overflow-x-auto rounded-xl border border-border bg-card"
          >
            <table className="w-full text-left text-xs">
              <thead className={REPORT_THEAD_CLASS}>
                <tr>
                  {showTermColumn && (
                    <th scope="col" className="px-4 py-2 font-medium">
                      Term
                    </th>
                  )}
                  <th scope="col" className="px-4 py-2 font-medium">
                    Incident Date
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Bucket
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Misconduct &amp; Details
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Issuer / Source
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {demerits.map((demerit) => {
                  const isWaived = demerit.status === "waived";
                  const unitLabel =
                    demerit.source === "council"
                      ? `Council ${demerit.consequence_outcome ?? "consequence"} (unit #${demerit.source_unit_index ?? demerit.incident_unit_index})`
                      : demerit.group_unit_count > 1
                        ? `Unit ${demerit.incident_unit_index} of ${demerit.group_unit_count}`
                        : null;

                  return (
                    <tr key={demerit.id}>
                      {showTermColumn && (
                        <td className="px-4 py-2 whitespace-nowrap text-muted-foreground tabular-nums">
                          {demerit.term_label}
                        </td>
                      )}
                      <td className="px-4 py-2 whitespace-nowrap text-muted-foreground tabular-nums">
                        {formatManilaDate(demerit.incident_on)}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <BucketBadge bucket={demerit.bucket} className="font-medium" />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex max-w-md flex-col gap-1">
                          {demerit.misconduct_label && (
                            <span className="whitespace-normal break-words font-medium text-foreground">
                              {demerit.misconduct_label}
                            </span>
                          )}
                          <span className="whitespace-normal break-words text-muted-foreground">
                            {demerit.description}
                          </span>
                          {unitLabel && (
                            <span className="text-[11px] text-muted-foreground tabular-nums">
                              {unitLabel}
                            </span>
                          )}
                          {isWaived && (demerit.waiver_reason || demerit.waived_at) && (
                            <div className="mt-1 rounded-lg border border-border/60 bg-muted/50 p-2 text-[11px] text-muted-foreground">
                              {demerit.waiver_reason && (
                                <p className="whitespace-normal break-words">
                                  <span className="font-medium text-foreground">
                                    Waiver reason:
                                  </span>{" "}
                                  {demerit.waiver_reason}
                                </p>
                              )}
                              {demerit.waived_at && (
                                <p
                                  className={
                                    demerit.waiver_reason ? "mt-1 tabular-nums" : "tabular-nums"
                                  }
                                >
                                  {demerit.waived_by_label
                                    ? `Waived by ${demerit.waived_by_label} \u00b7 `
                                    : "Waived "}
                                  <span suppressHydrationWarning>
                                    {formatManilaDateTime(demerit.waived_at)}
                                  </span>
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <DemeritStatusBadge waived={isWaived} className="font-medium" />
                      </td>
                      <td className="px-4 py-2 whitespace-normal break-words text-muted-foreground">
                        {demerit.issuer_label}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Merits in Period */}
      <section data-print-table-section className="flex w-full flex-col gap-2">
        <div
          data-print-heading
          className="flex items-baseline justify-between gap-2 break-after-avoid"
        >
          <h3 className="section-title break-after-avoid">Merits in Period</h3>
          <span className="text-xs text-muted-foreground tabular-nums">
            {merits.length} {merits.length === 1 ? "award" : "awards"}
          </span>
        </div>

        {merits.length === 0 ? (
          <Card
            data-print-avoid-break
            className="w-full p-6 text-center text-xs text-muted-foreground"
          >
            No merit awards in this period.
          </Card>
        ) : (
          <div
            data-print-scroll
            className="w-full overflow-x-auto rounded-xl border border-border bg-card"
          >
            <table className="w-full text-left text-xs">
              <thead className={REPORT_THEAD_CLASS}>
                <tr>
                  {showTermColumn && (
                    <th scope="col" className="px-4 py-2 font-medium">
                      Term
                    </th>
                  )}
                  <th scope="col" className="px-4 py-2 font-medium">
                    Award Date
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Description
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Valid Until
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Awarded By / Source
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {merits.map((merit) => (
                  <tr key={merit.id}>
                    {showTermColumn && (
                      <td className="px-4 py-2 whitespace-nowrap text-muted-foreground tabular-nums">
                        {merit.term_label}
                      </td>
                    )}
                    <td className="px-4 py-2 whitespace-nowrap text-muted-foreground tabular-nums">
                      {formatManilaDate(merit.awarded_on)}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex max-w-md flex-col gap-1">
                        <span className="whitespace-normal break-words font-medium text-foreground">
                          {merit.description}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {formatMeritSourceText(merit.source)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-muted-foreground tabular-nums">
                      {formatManilaDate(merit.expires_on)}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-col gap-1">
                        <MeritStatusBadge
                          isApplied={merit.status === "applied"}
                          isExpired={merit.status === "expired"}
                          appliedBucket={merit.applied_bucket}
                          className="w-fit font-medium"
                        />
                        {merit.status === "applied" && merit.applied_at && (
                          <span
                            className="text-[11px] text-muted-foreground tabular-nums"
                            suppressHydrationWarning
                          >
                            Applied {formatManilaDateTime(merit.applied_at)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 whitespace-normal break-words text-muted-foreground">
                      {merit.awarder_label}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Service Credits in Period */}
      <section data-print-table-section className="flex w-full flex-col gap-2">
        <div
          data-print-heading
          className="flex items-baseline justify-between gap-2 break-after-avoid"
        >
          <h3 className="section-title break-after-avoid">Service Credits in Period</h3>
          <span className="text-xs text-muted-foreground tabular-nums">
            {serviceCredits.length} {serviceCredits.length === 1 ? "credit" : "credits"}
          </span>
        </div>

        {serviceCredits.length === 0 ? (
          <Card
            data-print-avoid-break
            className="w-full p-6 text-center text-xs text-muted-foreground"
          >
            No service duty credits in this period.
          </Card>
        ) : (
          <div
            data-print-scroll
            className="w-full overflow-x-auto rounded-xl border border-border bg-card"
          >
            <table className="w-full text-left text-xs">
              <thead className={REPORT_THEAD_CLASS}>
                <tr>
                  {showTermColumn && (
                    <th scope="col" className="px-4 py-2 font-medium">
                      Term
                    </th>
                  )}
                  <th scope="col" className="px-4 py-2 font-medium">
                    Issued Date
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Bucket
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Status &amp; Details
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Supervisor / Issuer
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {serviceCredits.map((credit) => {
                  const isRevoked = credit.status === "revoked";
                  return (
                    <tr key={credit.id}>
                      {showTermColumn && (
                        <td className="px-4 py-2 whitespace-nowrap text-muted-foreground tabular-nums">
                          {credit.term_label}
                        </td>
                      )}
                      <td
                        className="px-4 py-2 whitespace-nowrap text-muted-foreground tabular-nums"
                        suppressHydrationWarning
                      >
                        {formatManilaDateTime(credit.issued_at)}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <BucketBadge bucket={credit.bucket} className="font-medium" />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex max-w-md flex-col gap-1">
                          <ServiceCreditBadge revoked={isRevoked} className="w-fit font-medium" />
                          {isRevoked && (credit.revocation_reason || credit.revoked_at) && (
                            <div className="mt-1 rounded-lg border border-border/60 bg-muted/50 p-2 text-[11px] text-muted-foreground">
                              {credit.revocation_reason && (
                                <p className="whitespace-normal break-words">
                                  <span className="font-medium text-foreground">
                                    Revocation note:
                                  </span>{" "}
                                  {credit.revocation_reason}
                                </p>
                              )}
                              {credit.revoked_at && (
                                <p
                                  className={
                                    credit.revocation_reason ? "mt-1 tabular-nums" : "tabular-nums"
                                  }
                                  suppressHydrationWarning
                                >
                                  Revoked {formatManilaDateTime(credit.revoked_at)}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 whitespace-normal break-words text-muted-foreground">
                        {credit.supervisor_label}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
