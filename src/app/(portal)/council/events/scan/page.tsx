import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";

import { QrScanStation } from "@/features/events/components/qr-scan-station";
import { canCapture } from "@/features/events/event-state";
import { getAttendanceSummary, getEvent } from "@/features/events/queries";
import { eventIdSchema } from "@/features/events/schemas";
import { getAccessContext } from "@/server/auth/access-context";

export const instant = false;

/** Full-screen QR station, outside the workspace shell. Same access as the capture page. */
export default async function EventScanPage({ searchParams }: {
  searchParams: Promise<{ event?: string | string[]; side?: string | string[] }>;
}) {
  await connection();
  const { event, side } = await searchParams;
  const access = await getAccessContext();
  if (access.status === "unauthenticated") redirect("/sign-in?next=/council/events");
  if (access.status === "error") throw new Error("Unable to verify Florence access. Try again later.");
  if (access.status === "unavailable") redirect("/access-unavailable");
  if (!access.workspaces.includes("council")) notFound();

  const parsed = eventIdSchema.safeParse({ eventId: event });
  if (!parsed.success) notFound();
  const selected = await getEvent(parsed.data.eventId);
  if (!selected || !canCapture(selected)) notFound();

  return (
    <QrScanStation
      event={selected}
      summary={await getAttendanceSummary(selected.id)}
      initialSide={side === "time_out" ? "time_out" : "time_in"}
      backHref={`/council/events?semester=${selected.semester_id}&event=${selected.id}`}
      now={new Date().toISOString()}
    />
  );
}
