import { env } from "cloudflare:workers";

import { getSession } from "@/lib/auth";
import { getSessionTokenFromCookies, json } from "@/lib/http";
import { buildCodexBankBrief, listMaterialsForCodexBank } from "@/lib/material-analysis";
import { shelfGoal } from "@/lib/shelf-fields";
import { shelfSubject } from "@/lib/subjects";

export async function GET(request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session || session.entry !== "parent") return json({ error: "Parent sign-in required." }, { status: 401 });

  const search = new URL(request.url).searchParams;
  const goal = shelfGoal(search.get("goal"));
  const subject = shelfSubject(search.get("subject"));
  if (!goal) return json({ error: "Choose a Selective or OC archive." }, { status: 400 });

  const { profileId } = await params;
  const shelf = await listMaterialsForCodexBank(env.DB, profileId, goal, session.user_id, subject);
  if (!shelf) return json({ error: "This resource shelf is unavailable." }, { status: 404 });
  if (!shelf.materials.length) {
    return json({
      error: subject === "reading"
        ? "Add Reading coaching reports or practice sources before asking Codex to review the shelf."
        : "Add coaching reports or practice-question sources before asking Codex to generate the bank.",
    }, { status: 400 });
  }

  return json({
    brief: buildCodexBankBrief({
      profileId,
      goal,
      subject,
      nickname: shelf.nickname,
      actorUserId: session.user_id,
      materials: shelf.materials,
    }),
    counts: {
      total: shelf.materials.length,
      coaching: shelf.materials.filter((item) => item.kind !== "study_material").length,
      practiceSources: shelf.materials.filter((item) => item.kind === "study_material").length,
    },
  });
}
