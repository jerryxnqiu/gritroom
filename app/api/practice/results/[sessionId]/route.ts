import { env } from "cloudflare:workers";

import { getSession } from "@/lib/auth";
import { getSessionTokenFromCookies, json } from "@/lib/http";
import { getLearnerPracticeResultSession } from "@/lib/practice";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session || session.entry !== "learner") {
    return json({ error: "Learner sign-in required." }, { status: 401 });
  }

  const { sessionId } = await params;
  if (!sessionId?.trim()) return json({ error: "Choose a practice session." }, { status: 400 });

  const result = await getLearnerPracticeResultSession(env.DB, session.user_id, sessionId.trim());
  if (!result) return json({ error: "That practice session is unavailable." }, { status: 404 });
  return json({ session: result });
}
