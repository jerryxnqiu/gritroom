import { env } from "cloudflare:workers";

import { getSession } from "@/lib/auth";
import { getSessionTokenFromCookies, json, readJson } from "@/lib/http";
import { acceptInvitation, closeInvitation } from "@/lib/invitations";

export async function POST(request: Request, { params }: { params: Promise<{ inviteId: string }> }) {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session) return json({ error: "Sign in with the invited email first." }, { status: 401 });

  const { inviteId } = await params;
  const body = await readJson<{ action?: unknown }>(request);
  const action = body?.action;
  if (!inviteId || inviteId.length > 100 || (action !== "accept" && action !== "decline" && action !== "cancel")) {
    return json({ error: "Choose an invitation action." }, { status: 400 });
  }

  if (action === "cancel" && session.entry !== "parent") {
    return json({ error: "Parent sign-in required." }, { status: 403 });
  }
  const result = action === "accept"
    ? await acceptInvitation(env.DB, session, inviteId)
    : await closeInvitation(env.DB, session, inviteId, action);

  if (!result.ok) return json({ error: result.message }, { status: result.status });
  return json(result);
}
