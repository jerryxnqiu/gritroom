import { getSession } from "@/lib/auth";
import { getSessionTokenFromCookies, json } from "@/lib/http";
import { getDeepseekApiKey, getGmailSmtpKeys } from "@/lib/secrets";
import { checkGmailConnection } from "@/lib/smtp";
import { env } from "cloudflare:workers";

export async function POST() {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session || session.entry !== "parent") {
    return json({ error: "Parent sign-in required." }, { status: 401 });
  }

  const configured = getGmailSmtpKeys();
  const deepseek = Boolean(getDeepseekApiKey());
  if (!configured.ok) {
    return json({
      ok: false,
      stage: "config",
      reason: configured.reason,
      deepseekConfigured: deepseek,
    });
  }

  const result = await checkGmailConnection(env.DB);
  return json({
    ...result,
    from: configured.keys.email,
    host: configured.keys.host,
    port: configured.keys.port,
    deepseekConfigured: deepseek,
  });
}
