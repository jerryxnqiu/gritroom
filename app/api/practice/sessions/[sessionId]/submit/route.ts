import { env } from "cloudflare:workers";

import { getSession } from "@/lib/auth";
import { getSessionTokenFromCookies, json } from "@/lib/http";
import { countUnusedPracticeQuestions, submitTimedPaper } from "@/lib/practice";

export async function POST(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session || session.entry !== "learner") return json({ error: "Learner sign-in required." }, { status: 401 });

  const { sessionId } = await params;
  const result = await submitTimedPaper(env.DB, session.user_id, sessionId);
  if (!result.ok) return json({ error: result.error }, { status: result.status });
  const remainingCount = await countUnusedPracticeQuestions(
    env.DB,
    result.session.profileId,
    result.session.examGoal,
  );
  return json({ session: result.session, remainingCount });
}
