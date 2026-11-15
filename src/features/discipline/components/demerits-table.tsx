import { AlertCircle, FileText, User } from "lucide-react";
import type { DemeritRecord } from "../contracts";
import { BucketBadge, DemeritStatusBadge } from "./disciplinary-badges";

export function DemeritsTable({
  demerits,
}: {
  demerits: DemeritRecord[];
}) {
  if (demerits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/80 p-8 text-center">
        <FileText className="size-8 text-muted-foreground/60" />
        <p className="text-sm font-medium text-foreground">No demerit records found</p>
        <p className="text-xs text-muted-foreground">
          There are no disciplinary infractions logged for this period.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-border bg-muted/50 font-medium text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Incident Date</th>
            <th className="px-4 py-3">Bucket</th>
            <th className="px-4 py-3">Misconduct & Description</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Issuer / Source</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {demerits.map((d) => {
            const isWaived = d.waived_at !== null;
            return (
              <tr key={d.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-muted-foreground whitespace-nowrap">
                  {d.incident_on}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <BucketBadge bucket={d.bucket} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    {d.misconduct_label && (
                      <span className="font-semibold text-foreground">
                        {d.misconduct_label}
                      </span>
                    )}
                    <span className="text-muted-foreground">{d.description}</span>
                    {d.consequence_outcome && (
                      <span className="text-[11px] font-medium text-muted-foreground">
                        Council consequence:{" "}
                        <span className="capitalize">{d.consequence_outcome}</span> (unit #{d.source_unit_index ?? 1})
                      </span>
                    )}
                    {isWaived && d.waiver_reason && (
                      <div className="mt-1 flex items-start gap-1 rounded bg-muted/60 p-1.5 text-[11px] text-muted-foreground">
                        <AlertCircle className="size-3 text-primary mt-0.5 shrink-0" />
                        <span>
                          <strong>Waiver reason:</strong> {d.waiver_reason}
                          {d.waived_by_name && ` (by ${d.waived_by_name})`}
                        </span>
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <DemeritStatusBadge waived={isWaived} />
                </td>
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <User className="size-3 text-muted-foreground/70" />
                    <span>
                      {d.external_source_name
                        ? `External: ${d.external_source_name}`
                        : d.issuer_name ?? (d.source === "council" ? "Council" : "Faculty")}
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
