import { Award, CheckCircle2, User, XCircle } from "lucide-react";
import type { MeritEndorsementRecord } from "../contracts";
import { EndorsementStatusBadge } from "./disciplinary-badges";

export function CouncilEndorsementsTable({
  endorsements,
}: {
  endorsements: MeritEndorsementRecord[];
}) {
  if (endorsements.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/80 p-8 text-center">
        <Award className="size-8 text-muted-foreground/60" />
        <p className="text-sm font-medium text-foreground">No merit endorsements submitted</p>
        <p className="text-xs text-muted-foreground">
          Student merit recommendations submitted by Council will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-border bg-muted/50 font-medium text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Student</th>
            <th className="px-4 py-3">Basis / Description</th>
            <th className="px-4 py-3">Requested Days</th>
            <th className="px-4 py-3">Assigned Instructor</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Decision</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {endorsements.map((e) => (
            <tr key={e.id} className="hover:bg-muted/30">
              <td className="px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold text-foreground">
                    {e.student_name ?? "Student"}
                  </span>
                  {e.student_university_id && (
                    <span className="font-mono text-[11px] text-primary">
                      {e.student_university_id}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-col gap-0.5 max-w-xs">
                  <span className="font-medium text-foreground">{e.description}</span>
                  <span className="text-[11px] text-muted-foreground">
                    Submitted by {e.submitter_name ?? "Council"}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3 font-semibold text-foreground whitespace-nowrap">
                {e.requested_days} {e.requested_days === 1 ? "day" : "days"}
              </td>
              <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                <div className="flex items-center gap-1.5">
                  <User className="size-3 text-muted-foreground/70" />
                  <span>{e.assigned_instructor_name ?? "Assigned Instructor"}</span>
                </div>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <EndorsementStatusBadge status={e.status} />
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {e.status === "approved" && (
                  <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-3" />
                    Approved
                  </span>
                )}
                {e.status === "rejected" && (
                  <div className="flex flex-col gap-0.5 text-[11px] text-destructive">
                    <span className="flex items-center gap-1">
                      <XCircle className="size-3" />
                      Rejected
                    </span>
                    {e.decision_reason && (
                      <span className="text-muted-foreground italic">
                        &quot;{e.decision_reason}&quot;
                      </span>
                    )}
                  </div>
                )}
                {e.status === "pending" && (
                  <span className="text-[11px] text-muted-foreground italic">
                    Awaiting instructor review
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
