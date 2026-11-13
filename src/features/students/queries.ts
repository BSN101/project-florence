import "server-only";

import { createUserClient } from "@/server/db/user-client";

import type { RosterCandidate, StudentRosterItem } from "./contracts";
import { studentNumberSchema } from "./schemas";
import { requireDirectoryViewer, requireRosterManager } from "./service";

/** The semester's roster/directory, sorted by year level then surname. Council (Exec/Ops) and Faculty. */
export async function getRoster(
  semesterId: string,
  workspace: "council" | "faculty" = "council"
): Promise<StudentRosterItem[]> {
  await requireDirectoryViewer(workspace);
  const client = await createUserClient();
  const { data, error } = await client.rpc("florence_roster", { p_semester: semesterId });
  if (error) throw new Error("Unable to load the roster");
  return data;
}

/** Exact-number lookup only, for the add-student preview. */
export async function lookupRosterCandidate(universityId: string): Promise<RosterCandidate | null> {
  await requireRosterManager();
  const parsed = studentNumberSchema.safeParse(universityId);
  if (!parsed.success) return null;
  const client = await createUserClient();
  const { data, error } = await client.rpc("florence_roster_candidate", { p_university_id: parsed.data });
  if (error) throw new Error("Unable to look up the student");
  return data[0] ?? null;
}

/** Returns invitation history for an individual student profile. Council and authorized provisioning only. */
export async function getStudentInvitationStatuses(profileId: string) {
  await requireRosterManager();
  const client = await createUserClient();
  const { data, error } = await client.rpc("florence_invitation_statuses", { p_profile: profileId });
  if (error) throw new Error("Unable to load student invitation history");
  return data;
}
