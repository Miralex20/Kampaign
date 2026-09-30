import { createTransport } from "nodemailer";

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export function getEmailTransport() {
  const transportConfig: any = {
    host: process.env["EMAIL_SERVER_HOST"] ?? "localhost",
    port: Number(process.env["EMAIL_SERVER_PORT"] ?? 1025),
    secure: process.env["EMAIL_SERVER_SECURE"] === "true",
    ignoreTLS: process.env["NODE_ENV"] !== "production",
  };

  if (process.env["EMAIL_SERVER_USER"]) {
    transportConfig.auth = {
      user: process.env["EMAIL_SERVER_USER"],
      pass: process.env["EMAIL_SERVER_PASSWORD"] ?? "",
    };
  }

  return createTransport(transportConfig);
}

export async function sendEmail({ to, subject, text, html }: SendEmailOptions): Promise<void> {
  const transport = getEmailTransport();
  const from = process.env["EMAIL_FROM"] ?? "noreply@campaign.local";

  await transport.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
}
