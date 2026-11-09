import { env } from "cloudflare:workers";

import { getSession } from "@/lib/auth";
import { getSessionTokenFromCookies, json, readJson } from "@/lib/http";
import {
  countUnusedPracticeQuestions,
  countUnusedWeakPracticeQuestions,
  getPracticeSession,
  latestPracticeSession,
  learnerProfile,
  parsePracticeMode,
  startPracticeSession,
} from "@/lib/practice";

export async function GET() {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session || session.entry !== "learner") return json({ error: "Learner sign-in required." }, { status: 401 });

  const profile = await learnerProfile(env.DB, session.user_id);
  if (!profile) return json({ session: null });

  const [latest, remainingCount, weakRemainingCount] = await Promise.all([
    latestPracticeSession(env.DB, profile.id, profile.examGoal),
    countUnusedPracticeQuestions(env.DB, profile.id, profile.examGoal),
    countUnusedWeakPracticeQuestions(env.DB, profile.id, profile.examGoal),
  ]);
  if (!latest) return json({ session: null, profile, remainingCount, weakRemainingCount });
  const practice = await getPracticeSession(env.DB, latest.id, session.user_id);
  return json({ session: practice, profile, remainingCount, weakRemainingCount });
}

export async function POST(request: Request) {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session || session.entry !== "learner") return json({ error: "Learner sign-in required." }, { status: 401 });

  const body = await readJson<{ mode?: unknown }>(request);
  if (!body) return json({ error: "Invalid request." }, { status: 400 });
  const mode = parsePracticeMode(body.mode);
  if (!mode) return json({ error: "Choose Practice, Weak spots, or a Timed paper." }, { status: 400 });

  const result = await startPracticeSession(env.DB, session.user_id, mode);
  if (!result.ok) return json({ error: result.error }, { status: result.status });
  const [remainingCount, weakRemainingCount] = await Promise.all([
    countUnusedPracticeQuestions(env.DB, result.session.profileId, result.session.examGoal),
    countUnusedWeakPracticeQuestions(env.DB, result.session.profileId, result.session.examGoal),
  ]);
  return json({ session: result.session, remainingCount, weakRemainingCount }, { status: 201 });
}
