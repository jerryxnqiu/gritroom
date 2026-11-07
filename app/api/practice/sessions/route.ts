import { env } from "cloudflare:workers";

import { getSession } from "@/lib/auth";
import { getSessionTokenFromCookies, json, readJson } from "@/lib/http";
import {
  activePracticeSession,
  getPracticeSession,
  learnerProfile,
  parsePracticeMode,
  startPracticeSession,
} from "@/lib/practice";

export async function GET() {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session || session.entry !== "learner") return json({ error: "Learner sign-in required." }, { status: 401 });

  const profile = await learnerProfile(env.DB, session.user_id);
  if (!profile) return json({ session: null });

  const active = await activePracticeSession(env.DB, profile.id, profile.examGoal);
  if (!active) return json({ session: null, profile });
  const practice = await getPracticeSession(env.DB, active.id, session.user_id);
  return json({ session: practice, profile });
}

export async function POST(request: Request) {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session || session.entry !== "learner") return json({ error: "Learner sign-in required." }, { status: 401 });

  const body = await readJson<{ mode?: unknown }>(request);
  if (!body) return json({ error: "Invalid request." }, { status: 400 });
  const mode = parsePracticeMode(body.mode);
  if (!mode) return json({ error: "Choose a starting-point check or focused practice." }, { status: 400 });

  const result = await startPracticeSession(env.DB, session.user_id, mode);
  if (!result.ok) return json({ error: result.error }, { status: result.status });
  return json({ session: result.session }, { status: 201 });
}
