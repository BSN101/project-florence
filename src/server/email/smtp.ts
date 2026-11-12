import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

// Delivery only: callers decide what to send. Never log message bodies, which
// may contain invitation links.
let transport: Transporter | undefined;

function smtpConfig() {
  const { MAILTRAP_HOST: host, MAILTRAP_PORT: port, MAILTRAP_USERNAME: user,
    MAILTRAP_PASSWORD: pass, MAILTRAP_SENDER_EMAIL: from } = process.env;
  if (!host || !port || !user || !pass || !from) throw new Error("SMTP configuration is missing");
  return { host, port: Number(port), user, pass, from };
}

export async function sendEmail(message: { to: string; subject: string; text: string; html: string }) {
  const config = smtpConfig();
  transport ??= nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    requireTLS: config.port !== 465,
    auth: { user: config.user, pass: config.pass },
  });
  await transport.sendMail({ from: config.from, ...message });
}
