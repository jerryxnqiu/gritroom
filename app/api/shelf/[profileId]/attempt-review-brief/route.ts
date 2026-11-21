import { env } from "cloudflare:workers";

import { getSession } from "@/lib/auth";
import { getSessionTokenFromCookies, json } from "@/lib/http";
import { buildCodexAttemptReviewBrief, listMaterialsForCodexBank } from "@/lib/material-analysis";
import { countIncorrectAttemptsNeedingReview } from "@/lib/practice";
import { shelfGoal } from "@/lib/shelf-fields";
import { shelfSubject } from "@/lib/subjects";

export async function GET(request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session || session.entry !== "parent") return json({ error: "Parent sign-in required." }, { status: 401 });

  const url = new URL(request.url);
  const goal = shelfGoal(url.searchParams.get("goal"));
  if (!goal) return json({ error: "Choose a Selective or OC archive." }, { status: 400 });

  const subject = shelfSubject(url.searchParams.get("subject"));
  if (subject !== "thinking" && subject !== "mathematics") {
    return json({ error: "Incorrect-attempt review is for Thinking Skills or Mathematics." }, { status: 400 });
  }

  const { profileId } = await params;
  const shelf = await listMaterialsForCodexBank(env.DB, profileId, goal, session.user_id, subject);
  if (!shelf) return json({ error: "This resource shelf is unavailable." }, { status: 404 });

  const pendingCount = await countIncorrectAttemptsNeedingReview(
    env.DB,
    profileId,
    goal,
    session.user_id,
    subject,
  );
  if (!pendingCount) {
    return json({ error: "No incorrect attempts are waiting for a Codex review in this archive." }, { status: 400 });
  }

  return json({
    brief: buildCodexAttemptReviewBrief({
      profileId,
      goal,
      nickname: shelf.nickname,
      actorUserId: session.user_id,
      pendingCount,
      subject,
    }),
    pendingCount,
  });
}
