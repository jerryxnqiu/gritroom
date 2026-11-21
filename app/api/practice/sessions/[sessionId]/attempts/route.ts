import { env } from "cloudflare:workers";

import { getSession } from "@/lib/auth";
import { getSessionTokenFromCookies, json, readJson } from "@/lib/http";
import {
  countUnusedMathematicsQuestions,
  countUnusedWeakMathematicsQuestions,
} from "@/lib/mathematics-practice";
import {
  countUnusedPracticeQuestions,
  countUnusedWeakPracticeQuestions,
  parseAttemptInput,
  parseTimedDraftInput,
  saveTimedDraft,
  submitPracticeAttempt,
} from "@/lib/practice";
import { countUnusedReadingQuestions } from "@/lib/reading-practice";

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session || session.entry !== "learner") return json({ error: "Learner sign-in required." }, { status: 401 });

  const body = await readJson(request);
  if (!body || typeof body !== "object") return json({ error: "Invalid request." }, { status: 400 });
  const { sessionId } = await params;
  const draft = (body as { draft?: unknown }).draft === true;

  if (draft) {
    const input = parseTimedDraftInput(body);
    if (!input) return json({ error: "Choose an answer before saving." }, { status: 400 });
    const result = await saveTimedDraft(env.DB, session.user_id, sessionId, input);
    if (!result.ok) return json({ error: result.error }, { status: result.status });
    return json({ session: result.session, attempt: result.attempt });
  }

  const input = parseAttemptInput(body);
  if (!input) return json({ error: "Choose an answer and confidence before saving." }, { status: 400 });

  const result = await submitPracticeAttempt(env.DB, session.user_id, sessionId, input);
  if (!result.ok) return json({ error: result.error }, { status: result.status });
  const subject = result.session.subject;
  const [remainingCount, weakRemainingCount] = await Promise.all([
    subject === "reading"
      ? countUnusedReadingQuestions(env.DB, result.session.profileId, result.session.examGoal)
      : subject === "mathematics"
        ? countUnusedMathematicsQuestions(env.DB, result.session.profileId, result.session.examGoal)
        : countUnusedPracticeQuestions(env.DB, result.session.profileId, result.session.examGoal),
    subject === "thinking"
      ? countUnusedWeakPracticeQuestions(env.DB, result.session.profileId, result.session.examGoal)
      : subject === "mathematics"
        ? countUnusedWeakMathematicsQuestions(env.DB, result.session.profileId, result.session.examGoal)
        : Promise.resolve(0),
  ]);
  return json({ session: result.session, attempt: result.attempt, remainingCount, weakRemainingCount });
}
