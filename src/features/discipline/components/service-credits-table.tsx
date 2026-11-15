import { AlertCircle, Clock, User } from "lucide-react";
import type { ServiceCreditRecord } from "../contracts";
import { BucketBadge, ServiceCreditBadge } from "./disciplinary-badges";

export function ServiceCreditsTable({
  credits,
}: {
  credits: ServiceCreditRecord[];
}) {
  if (credits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/80 p-8 text-center">
        <Clock className="size-8 text-muted-foreground/60" />
        <p className="text-sm font-medium text-foreground">No service duty credits recorded</p>
        <p className="text-xs text-muted-foreground">
          Completed extension service duty sessions will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-border bg-muted/50 font-medium text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Issued Date</th>
            <th className="px-4 py-3">Duty Bucket</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Supervisor / Issuer</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {credits.map((c) => {
            const isRevoked = c.revoked_at !== null;
            return (
              <tr key={c.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-muted-foreground whitespace-nowrap">
                  {new Date(c.issued_at).toLocaleDateString("en-CA", {
                    timeZone: "Asia/Manila",
                  })}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <BucketBadge bucket={c.bucket} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <ServiceCreditBadge revoked={isRevoked} />
                    {isRevoked && c.revocation_reason && (
                      <div className="flex items-start gap-1 rounded bg-muted/60 p-1 text-[11px] text-muted-foreground">
                        <AlertCircle className="size-3 text-destructive mt-0.5 shrink-0" />
                        <span>
                          <strong>Revocation note:</strong> {c.revocation_reason}
                        </span>
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <User className="size-3 text-muted-foreground/70" />
                    <span>{c.issuer_name ?? "Instructor"}</span>
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
