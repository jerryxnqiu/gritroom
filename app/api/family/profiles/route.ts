import { env } from "cloudflare:workers";
import { getSession } from "@/lib/auth";
import { parseProfileInput } from "@/lib/family";
import { getSessionTokenFromCookies, json, readJson } from "@/lib/http";
import { createId } from "@/lib/ids";
import { nowIso } from "@/lib/time";

export async function POST(request: Request) {
  const session = await getSession(await getSessionTokenFromCookies());
  if (!session || session.entry !== "parent") {
    return json({ error: "Parent sign-in required." }, { status: 401 });
  }

  const body = await readJson<{ familyId?: unknown }>(request);
  const input = parseProfileInput(body);
  const familyId = typeof body?.familyId === "string" ? body.familyId : "";
  if (!input || !familyId || familyId.length > 100) {
    return json({ error: "Enter a child’s nickname and choose Selective or OC." }, { status: 400 });
  }

  const profileId = createId("prf");
  const stamp = nowIso();
  const [inserted] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO profiles (id, family_id, nickname, exam_goal, created_at, updated_at)
       SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (
         SELECT 1 FROM guardian_grants
         WHERE family_id = ? AND user_id = ? AND revoked_at IS NULL
           AND profile_id IS NULL AND role IN ('owner', 'admin')
       )`,
    ).bind(profileId, familyId, input.nickname, input.examGoal, stamp, stamp, familyId, session.user_id),
    env.DB.prepare(
      `INSERT INTO account_events (id, family_id, user_id, profile_id, event_type, created_at)
       SELECT ?, family_id, ?, id, 'profile_created', ? FROM profiles WHERE id = ?`,
    ).bind(createId("evt"), session.user_id, stamp, profileId),
  ]);
  if (!inserted.meta.changes) return json({ error: "You cannot add a child to that family." }, { status: 403 });
  return json({ profileId }, { status: 201 });
}
