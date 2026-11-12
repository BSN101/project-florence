"use server";

import { AccessDeniedError } from "@/server/auth/require-workspace";

import type { ArchiveBlockers, ExecutiveCandidate, ProvisioningResult } from "./provisioning-contracts";
import type {
  CancelInvitationInput, ChangeFacultyAssignmentsInput, GrantExecutiveInput, ProfileCommandInput,
  ProvisionFacultyInput, ReplaceExecutiveInput, UpdateFacultyIdentityInput,
} from "./provisioning-schemas";
import * as service from "./provisioning-service";

async function guarded(run: () => Promise<ProvisioningResult>): Promise<ProvisioningResult> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AccessDeniedError) return { success: false, error: "You are not permitted to make this change." };
    return { success: false, error: "We couldn't complete that change. Please try again." };
  }
}

export async function provisionFacultyAction(input: ProvisionFacultyInput) { return guarded(() => service.provisionFaculty(input)); }
export async function updateFacultyIdentityAction(input: UpdateFacultyIdentityInput) { return guarded(() => service.updateFacultyIdentity(input)); }
export async function changeFacultyAssignmentsAction(input: ChangeFacultyAssignmentsInput) { return guarded(() => service.changeFacultyAssignments(input)); }
export async function archiveFacultyAction(input: ProfileCommandInput) { return guarded(() => service.archiveFaculty(input)); }
export async function reissueInvitationAction(input: ProfileCommandInput) { return guarded(() => service.reissueInvitation(input)); }
export async function cancelInvitationAction(input: CancelInvitationInput) { return guarded(() => service.cancelInvitation(input)); }
export async function grantExecutiveAction(input: GrantExecutiveInput) { return guarded(() => service.grantExecutive(input)); }
export async function replaceExecutiveAction(input: ReplaceExecutiveInput) { return guarded(() => service.replaceExecutive(input)); }
export async function removeExecutiveAction(input: ProfileCommandInput) { return guarded(() => service.removeExecutive(input)); }

export type CandidateLookup = { found: true; candidate: ExecutiveCandidate } | { found: false; error?: string };

export async function lookupExecutiveCandidateAction(universityId: string): Promise<CandidateLookup> {
  try {
    const candidate = await service.lookupExecutiveCandidate(universityId);
    return candidate ? { found: true, candidate } : { found: false };
  } catch (error) {
    return { found: false, error: error instanceof AccessDeniedError ? "You are not permitted to look up students." : "We couldn't search right now. Please try again." };
  }
}

/** Loaded when the archive dialog opens, so the warning reflects current data. */
export async function archivePreviewAction(profileId: string): Promise<ArchiveBlockers | null> {
  try { return await service.getArchivePreview(profileId); } catch { return null; }
}
