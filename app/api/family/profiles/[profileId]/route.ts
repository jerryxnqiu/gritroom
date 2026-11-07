import { env } from "cloudflare:workers";
import { getSession } from "@/lib/auth";
import { parseProfileInput } from "@/lib/family";
import { getSessionTokenFromCookies, json, readJson } from "@/lib/http";
import { createId } from "@/lib/ids";
import { nowIso } from "@/lib/time";

export async function PATCH(request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session || session.entry !== "parent") {
    return json({ error: "Parent sign-in required." }, { status: 401 });
  }

  const { profileId } = await params;
  const input = parseProfileInput(await readJson(request));
  if (!input || !profileId || profileId.length > 100) {
    return json({ error: "Enter a child’s nickname and choose Selective or OC." }, { status: 400 });
  }

  const stamp = nowIso();
  const [updated] = await env.DB.batch([
    env.DB.prepare(
      `UPDATE profiles SET nickname = ?, exam_goal = ?, updated_at = ? WHERE id = ? AND EXISTS (
         SELECT 1 FROM guardian_grants g WHERE g.family_id = profiles.family_id AND g.user_id = ?
           AND g.revoked_at IS NULL AND g.role IN ('owner', 'admin')
           AND (g.profile_id IS NULL OR g.profile_id = profiles.id)
       )`,
    ).bind(input.nickname, input.examGoal, stamp, profileId, session.user_id),
    env.DB.prepare(
      `INSERT INTO account_events (id, family_id, user_id, profile_id, event_type, created_at)
       SELECT ?, family_id, ?, id, 'profile_updated', ? FROM profiles WHERE id = ? AND changes() > 0`,
    ).bind(createId("evt"), session.user_id, stamp, profileId),
  ]);
  if (!updated.meta.changes) return json({ error: "You cannot edit that child’s profile." }, { status: 403 });
  return json({ ok: true });
}
