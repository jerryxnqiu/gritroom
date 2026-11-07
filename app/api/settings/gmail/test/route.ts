import { getSession } from "@/lib/auth";
import { getSessionTokenFromCookies, json } from "@/lib/http";
import { sendEmail } from "@/lib/smtp";
import { env } from "cloudflare:workers";

export async function POST() {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session || session.entry !== "parent") {
    return json({ error: "Parent sign-in required." }, { status: 401 });
  }

  const result = await sendEmail({
    db: env.DB,
    purpose: "parent-test",
    to: session.email,
    subject: "GritRoom test email",
    text: [
      "This is a GritRoom test email.",
      "",
      "A successful test means SMTP accepted the message.",
      "It does not prove that login codes will always arrive, and it does not change who can sign in.",
    ].join("\n"),
  });

  if (!result.ok) {
    return json(result, { status: 502 });
  }

  return json({
    ok: true,
    message: `Test email accepted for delivery to ${session.email}.`,
    messageId: result.messageId,
  });
}
