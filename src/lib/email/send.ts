import "server-only";
import { getEnv } from "@/lib/env";

type Email = { to: string; subject: string; text: string };

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("No email service is configured (RESEND_API_KEY)");
    this.name = "EmailNotConfiguredError";
  }
}

/**
 * Sends one email. With RESEND_API_KEY set it goes through Resend. Without it,
 * in development only, the message is printed to the terminal running the app,
 * so sign-in codes can be used before an email service exists.
 */
export async function sendEmail(email: Email): Promise<void> {
  const env = getEnv();
  if (env.RESEND_API_KEY) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [email.to], subject: email.subject, text: email.text }),
    });
    if (!response.ok) throw new Error(`email send failed: ${response.status}`);
    return;
  }
  if (process.env.NODE_ENV === "development") {
    console.log(`\n──────── מייל (פיתוח בלבד, לא נשלח) ────────\nאל: ${email.to}\nנושא: ${email.subject}\n\n${email.text}\n────────────────────────────────────────────\n`);
    return;
  }
  throw new EmailNotConfiguredError();
}
