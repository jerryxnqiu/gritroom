import { env } from "cloudflare:workers";

import { getSession } from "@/lib/auth";
import { getSessionTokenFromCookies, json, readJson } from "@/lib/http";
import { revokeGuardian } from "@/lib/invitations";

export async function POST(request: Request, { params }: { params: Promise<{ grantId: string }> }) {
  const session = await getSession(await getSessionTokenFromCookies());
  if (session?.entry !== "parent") return json({ error: "Parent sign-in required." }, { status: 401 });

  const { grantId } = await params;
  const body = await readJson<{ action?: unknown }>(request);
  if (!grantId || grantId.length > 100 || body?.action !== "revoke") {
    return json({ error: "Choose a guardian to remove." }, { status: 400 });
  }

  const result = await revokeGuardian(env.DB, session, grantId);
  return result.ok ? json({ ok: true }) : json({ error: result.message }, { status: result.status });
}
