import { env } from "cloudflare:workers";

import { getSession } from "@/lib/auth";
import { getSessionTokenFromCookies, json } from "@/lib/http";
import {
  countUnusedPracticeQuestions,
  countUnusedWeakPracticeQuestions,
  submitTimedPaper,
} from "@/lib/practice";
import { countUnusedReadingQuestions } from "@/lib/reading-practice";

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session || session.entry !== "learner") return json({ error: "Learner sign-in required." }, { status: 401 });

  const { sessionId } = await params;
  let force = false;
  try {
    const body = await request.json() as { force?: boolean };
    force = Boolean(body?.force);
  } catch {
    force = false;
  }

  const result = await submitTimedPaper(env.DB, session.user_id, sessionId, { force });
  if (!result.ok) return json({ error: result.error }, { status: result.status });
  const reading = result.session.subject === "reading";
  const [remainingCount, weakRemainingCount] = await Promise.all([
    reading
      ? countUnusedReadingQuestions(env.DB, result.session.profileId, result.session.examGoal)
      : countUnusedPracticeQuestions(env.DB, result.session.profileId, result.session.examGoal),
    reading
      ? Promise.resolve(0)
      : countUnusedWeakPracticeQuestions(env.DB, result.session.profileId, result.session.examGoal),
  ]);
  return json({ session: result.session, remainingCount, weakRemainingCount });
}
