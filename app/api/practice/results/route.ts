import { env } from "cloudflare:workers";

import { getSession } from "@/lib/auth";
import { getSessionTokenFromCookies, json } from "@/lib/http";
import { listLearnerPracticeResults, parseEvidenceModeFilter } from "@/lib/practice";
import { shelfSubject } from "@/lib/subjects";

export async function GET(request: Request) {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session || session.entry !== "learner") {
    return json({ error: "Learner sign-in required." }, { status: 401 });
  }

  const url = new URL(request.url);
  const mode = parseEvidenceModeFilter(url.searchParams.get("mode"));
  const offset = Number(url.searchParams.get("offset") || "0");
  const limit = Number(url.searchParams.get("limit") || "10");
  if (!mode) return json({ error: "Choose an optional mode filter." }, { status: 400 });
  const subject = shelfSubject(url.searchParams.get("subject"));

  const sessionOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
  const sessionLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 30) : 10;
  const sessions = await listLearnerPracticeResults(env.DB, session.user_id, {
    mode,
    subject,
    sessionOffset,
    sessionLimit: sessionLimit + 1,
  });
  const hasMore = sessions.length > sessionLimit;
  return json({
    sessions: hasMore ? sessions.slice(0, sessionLimit) : sessions,
    hasMore,
    offset: sessionOffset,
    limit: sessionLimit,
    subject,
  });
}
