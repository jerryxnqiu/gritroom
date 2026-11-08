import { getSession } from "@/lib/auth";
import { isInstallationOwner } from "@/lib/family";
import { getSessionTokenFromCookies, json } from "@/lib/http";
import { getGmailSmtpKeys } from "@/lib/secrets";
import { checkGmailConnection } from "@/lib/smtp";
import { env } from "cloudflare:workers";

export async function POST() {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session || session.entry !== "parent") {
    return json({ error: "Parent sign-in required." }, { status: 401 });
  }
  if (!(await isInstallationOwner(env.DB, session.user_id))) {
    return json({ error: "Installation owner access required." }, { status: 403 });
  }

  const configured = getGmailSmtpKeys();
  if (!configured.ok) {
    return json({
      ok: false,
      stage: "config",
      reason: configured.reason,
    });
  }

  const result = await checkGmailConnection(env.DB);
  return json({
    ...result,
    from: configured.keys.email,
    host: configured.keys.host,
    port: configured.keys.port,
  });
}
