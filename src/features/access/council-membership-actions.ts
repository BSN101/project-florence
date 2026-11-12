"use server";

import { AccessDeniedError } from "@/server/auth/require-workspace";

import * as service from "./council-membership-service";
import type { CandidateLookup } from "./provisioning-actions";
import type { AddCouncilMemberInput, ChangeCouncilMemberInput, RemoveCouncilMemberInput } from "./provisioning-schemas";
import { guarded } from "./provisioning-service";

export async function addCouncilMemberAction(input: AddCouncilMemberInput) { return guarded(() => service.addCouncilMember(input)); }
export async function changeCouncilMemberAction(input: ChangeCouncilMemberInput) { return guarded(() => service.changeCouncilMember(input)); }
export async function removeCouncilMemberAction(input: RemoveCouncilMemberInput) { return guarded(() => service.removeCouncilMember(input)); }

export async function lookupCouncilCandidateAction(universityId: string): Promise<CandidateLookup> {
  try {
    const candidate = await service.lookupCouncilCandidate(universityId);
    return candidate ? { found: true, candidate } : { found: false };
  } catch (error) {
    return { found: false, error: error instanceof AccessDeniedError ? "You are not permitted to look up students." : "We couldn't search right now. Please try again." };
  }
}
