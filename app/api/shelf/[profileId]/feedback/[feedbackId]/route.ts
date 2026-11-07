import { env } from "cloudflare:workers";

import { getSession } from "@/lib/auth";
import { getSessionTokenFromCookies, json } from "@/lib/http";
import { withdrawShelfFeedback } from "@/lib/resource-shelf";

export async function DELETE(request: Request, { params }: { params: Promise<{ profileId: string; feedbackId: string }> }) {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session || session.entry !== "parent") return json({ error: "Parent sign-in required." }, { status: 401 });

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Invalid request origin." }, { status: 403 });

  const { profileId, feedbackId } = await params;
  return await withdrawShelfFeedback(env.DB, profileId, feedbackId, session.user_id)
    ? json({ ok: true })
    : json({ error: "This feedback is unavailable." }, { status: 404 });
}
