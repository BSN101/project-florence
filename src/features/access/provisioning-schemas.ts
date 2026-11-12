import { z } from "zod";

// Request keys come from the browser only so a retried submit replays instead of
// acting twice; the database ties each key to the actor and exact input.
const requestKey = z.string().uuid();
const profileId = z.string().uuid();
const optionalName = z.string().trim().max(100).optional().transform((value) => value || null);
const names = {
  firstName: z.string().trim().min(1, "First name is required").max(100),
  middleName: optionalName,
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  suffix: optionalName,
};
const email = z.string().trim().toLowerCase().max(254).email("Enter a valid email address");
const label = z.string().trim().min(1, "Position label is required").max(100);

export const instructorRoles = ["Academic Instructor", "Clinical Instructor"] as const;
export const coordinatorFor = {
  "Academic Instructor": "Academic Coordinator",
  "Clinical Instructor": "RLE Coordinator",
} as const;
const assignment = { instructorRole: z.enum(instructorRoles), coordinator: z.boolean() };

export const provisionFacultySchema = z.object({ requestKey, ...names, email, ...assignment });
export const updateFacultyIdentitySchema = z.object({ requestKey, profileId, ...names, email });
export const changeFacultyAssignmentsSchema = z.object({ requestKey, profileId, ...assignment });
export const profileCommandSchema = z.object({ requestKey, profileId });
export const cancelInvitationSchema = z.object({ requestKey, invitationId: z.string().uuid() });
export const grantExecutiveSchema = z.object({
  requestKey,
  universityId: z.string().trim().regex(/^[0-9]{2}-1-[0-9]{5}$/, "Enter the exact university number, e.g. 21-1-00001"),
  label,
});
export const replaceExecutiveSchema = z.object({
  requestKey, profileId, accessRole: z.enum(["operations", "representative"]), label,
});

export type ProvisionFacultyInput = z.input<typeof provisionFacultySchema>;
export type UpdateFacultyIdentityInput = z.input<typeof updateFacultyIdentitySchema>;
export type ChangeFacultyAssignmentsInput = z.input<typeof changeFacultyAssignmentsSchema>;
export type ProfileCommandInput = z.input<typeof profileCommandSchema>;
export type CancelInvitationInput = z.input<typeof cancelInvitationSchema>;
export type GrantExecutiveInput = z.input<typeof grantExecutiveSchema>;
export type ReplaceExecutiveInput = z.input<typeof replaceExecutiveSchema>;
