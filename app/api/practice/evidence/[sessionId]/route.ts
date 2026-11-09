import { env } from "cloudflare:workers";

import { getSession } from "@/lib/auth";
import { getSessionTokenFromCookies, json } from "@/lib/http";
import { childAccess } from "@/lib/invitations";
import { getPracticeEvidenceSession } from "@/lib/practice";
import { shelfGoal } from "@/lib/shelf-fields";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session || session.entry !== "parent") {
    return json({ error: "Family sign-in required." }, { status: 401 });
  }

  const { sessionId } = await params;
  const url = new URL(request.url);
  const profileId = url.searchParams.get("profileId")?.trim() || "";
  const goal = shelfGoal(url.searchParams.get("goal"));
  if (!sessionId?.trim() || !profileId || !goal) {
    return json({ error: "Choose a child, exam archive, and practice session." }, { status: 400 });
  }
  if (!(await childAccess(env.DB, profileId, session.user_id))) {
    return json({ error: "You do not have access to this child." }, { status: 403 });
  }

  const result = await getPracticeEvidenceSession(
    env.DB,
    profileId,
    goal,
    session.user_id,
    sessionId.trim(),
  );
  if (!result) return json({ error: "That practice session is unavailable." }, { status: 404 });
  return json({ session: result });
}
