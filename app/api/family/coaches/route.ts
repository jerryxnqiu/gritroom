import { env } from "cloudflare:workers";

import { getSession } from "@/lib/auth";
import { getSessionTokenFromCookies, json, readJson } from "@/lib/http";
import { revokeCoach } from "@/lib/invitations";

export async function POST(request: Request) {
  const session = await getSession(await getSessionTokenFromCookies());
  if (session?.entry !== "parent") return json({ error: "Parent sign-in required." }, { status: 401 });

  const body = await readJson<{ action?: unknown; profileId?: unknown; userId?: unknown }>(request);
  const profileId = typeof body?.profileId === "string" ? body.profileId : "";
  const userId = typeof body?.userId === "string" ? body.userId : "";
  if (body?.action !== "revoke" || !profileId || profileId.length > 100 || !userId || userId.length > 100) {
    return json({ error: "Choose a coach to remove." }, { status: 400 });
  }

  const result = await revokeCoach(env.DB, session, profileId, userId);
  return result.ok ? json({ ok: true }) : json({ error: result.message }, { status: result.status });
}
