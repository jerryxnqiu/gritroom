import { env } from "cloudflare:workers";

import { getSession } from "@/lib/auth";
import { getSessionTokenFromCookies, json } from "@/lib/http";
import { childAccess } from "@/lib/invitations";
import { listPracticeEvidence, parseEvidenceModeFilter } from "@/lib/practice";
import { shelfGoal } from "@/lib/shelf-fields";

export async function GET(request: Request) {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session || session.entry !== "parent") {
    return json({ error: "Family sign-in required." }, { status: 401 });
  }

  const url = new URL(request.url);
  const profileId = url.searchParams.get("profileId")?.trim() || "";
  const goal = shelfGoal(url.searchParams.get("goal"));
  const mode = parseEvidenceModeFilter(url.searchParams.get("mode"));
  const offset = Number(url.searchParams.get("offset") || "0");
  const limit = Number(url.searchParams.get("limit") || "20");

  if (!profileId || !goal || !mode) {
    return json({ error: "Choose a child, exam archive, and optional mode filter." }, { status: 400 });
  }
  if (!(await childAccess(env.DB, profileId, session.user_id))) {
    return json({ error: "You do not have access to this child." }, { status: 403 });
  }

  const sessionOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
  const sessionLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 50) : 20;
  const sessions = await listPracticeEvidence(env.DB, profileId, goal, session.user_id, {
    mode,
    sessionOffset,
    sessionLimit: sessionLimit + 1,
  });
  const hasMore = sessions.length > sessionLimit;
  return json({
    sessions: hasMore ? sessions.slice(0, sessionLimit) : sessions,
    hasMore,
    offset: sessionOffset,
    limit: sessionLimit,
  });
}
