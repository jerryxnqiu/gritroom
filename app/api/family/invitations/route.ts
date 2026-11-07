import { env } from "cloudflare:workers";

import { getSession } from "@/lib/auth";
import { getSessionTokenFromCookies, isValidEmail, json, normalizeEmail, readJson } from "@/lib/http";
import { issueInvitation } from "@/lib/invitations";
import { sendEmail } from "@/lib/smtp";

export async function POST(request: Request) {
  const session = await getSession(await getSessionTokenFromCookies());
  if (session?.entry !== "parent") return json({ error: "Parent sign-in required." }, { status: 401 });

  const body = await readJson<{ profileId?: unknown; email?: unknown; role?: unknown }>(request);
  const profileId = typeof body?.profileId === "string" ? body.profileId : "";
  const email = normalizeEmail(body?.email);
  const role = body?.role;
  if (!profileId || profileId.length > 100 || !isValidEmail(email) || (role !== "learner" && role !== "guardian")) {
    return json({ error: "Enter a valid recipient email for this child." }, { status: 400 });
  }

  const entry = role === "learner" ? "learner" : "parent";
  const signInUrl = new URL("/?entry=" + entry, request.url).toString();
  const result = await issueInvitation(env.DB, session, { profileId, email, role }, async () => {
    const delivery = await sendEmail({
      db: env.DB,
      purpose: "family-invitation",
      to: email,
      subject: "Your GritRoom invitation",
      text: [
        role === "learner"
          ? "A parent has invited you to connect your learner profile in GritRoom."
          : "A family has invited you to be a guardian for a child in GritRoom.",
        "",
        "Open GritRoom and sign in with this exact email address: " + signInUrl,
        "Enter the six-digit code from your inbox, then review and accept the invitation in GritRoom.",
        "The invitation expires in seven days. If you weren’t expecting it, you can decline it.",
        "You never need to share your email password.",
      ].join("\n"),
    });
    return delivery.ok;
  });

  if (!result.ok) return json({ error: result.message }, { status: result.status });
  return json({ id: result.id }, { status: 201 });
}
