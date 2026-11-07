import { env } from "cloudflare:workers";

import { getSession } from "@/lib/auth";
import { getSessionTokenFromCookies, json, readJson } from "@/lib/http";
import { saveShelfFeedback } from "@/lib/resource-shelf";
import { shelfGoal } from "@/lib/shelf-fields";

export async function POST(request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session || session.entry !== "parent") return json({ error: "Parent sign-in required." }, { status: 401 });

  const input = await readJson<{ goal?: unknown; body?: unknown }>(request);
  const goal = shelfGoal(input?.goal);
  const body = typeof input?.body === "string" ? input.body.trim() : "";
  if (!goal || !body || body.length > 2000) {
    return json({ error: "Choose an exam goal and enter feedback of up to 2,000 characters." }, { status: 400 });
  }

  const { profileId } = await params;
  const id = await saveShelfFeedback(env.DB, profileId, goal, session.user_id, body);
  return id
    ? json({ id }, { status: 201 })
    : json({ error: "This resource shelf is unavailable." }, { status: 404 });
}
