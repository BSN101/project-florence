import "server-only";

import { sendEmail } from "./smtp";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * The token travels in the URL fragment, which browsers never send to the
 * server, so it stays out of request logs. Opening the link consumes nothing.
 */
export async function sendInvitationEmail(input: {
  origin: string; to: string; firstName: string; token: string; expiresAt: string;
}) {
  const link = `${new URL("/invitation/accept", input.origin)}#t=${input.token}`;
  const expires = new Intl.DateTimeFormat("en-PH", {
    dateStyle: "long", timeStyle: "short", timeZone: "Asia/Manila",
  }).format(new Date(input.expiresAt));
  const name = escapeHtml(input.firstName);

  await sendEmail({
    to: input.to,
    subject: "Set up your Project Florence account",
    text: `Hello ${input.firstName},\n\nYou have been invited to Project Florence. Open this link to choose your password:\n\n${link}\n\nThe link expires on ${expires} (Philippine time). If you weren't expecting this invitation, you can ignore this email.`,
    html: `<p>Hello ${name},</p><p>You have been invited to Project Florence. Open this link to choose your password:</p><p><a href="${escapeHtml(link)}">Set up your account</a></p><p>The link expires on ${escapeHtml(expires)} (Philippine time). If you weren't expecting this invitation, you can ignore this email.</p>`,
  });
}
