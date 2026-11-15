import { Award, Calendar, User } from "lucide-react";
import type { MeritRecord } from "../contracts";
import { MeritStatusBadge } from "./disciplinary-badges";

export function MeritsTable({
  merits,
}: {
  merits: MeritRecord[];
}) {
  if (merits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/80 p-8 text-center">
        <Award className="size-8 text-muted-foreground/60" />
        <p className="text-sm font-medium text-foreground">No merit awards recorded</p>
        <p className="text-xs text-muted-foreground">
          Merits earned for voluntary service or outstanding performance will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-border bg-muted/50 font-medium text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Award Date</th>
            <th className="px-4 py-3">Description</th>
            <th className="px-4 py-3">Validity / Expiry</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Awarded By / Source</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {merits.map((m) => (
            <tr key={m.id} className="hover:bg-muted/30">
              <td className="px-4 py-3 font-mono text-muted-foreground whitespace-nowrap">
                {m.awarded_on}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium text-foreground">{m.description}</span>
                  <span className="text-[11px] text-muted-foreground capitalize">
                    Source: {m.source}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3 font-mono text-muted-foreground whitespace-nowrap">
                <div className="flex items-center gap-1.5 text-[11px]">
                  <Calendar className="size-3 text-muted-foreground/70" />
                  <span>Valid until {m.expires_on}</span>
                </div>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <MeritStatusBadge isApplied={m.isApplied} isExpired={m.isExpired} />
              </td>
              <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                <div className="flex items-center gap-1.5">
                  <User className="size-3 text-muted-foreground/70" />
                  <span>
                    {m.external_source_name
                      ? `External: ${m.external_source_name}`
                      : m.awarder_name ?? (m.source === "endorsement" ? "Council Endorsement" : "Clinical Instructor")}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
