import "server-only";

/**
 * Send a transactional email. If RESEND_API_KEY is set, mail goes through Resend's HTTP
 * API (it has a free tier); otherwise the message is written to the server log, which is
 * enough for local development and for testing password reset.
 */
export async function sendEmail(msg: { to: string; subject: string; text: string }): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    console.info(`[email:dev] to=${msg.to} subject=${JSON.stringify(msg.subject)}\n${msg.text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: msg.to, subject: msg.subject, text: msg.text }),
  });
  if (!res.ok) {
    console.error(`[email] send failed with status ${res.status}`);
    throw new Error("Could not send email");
  }
}
