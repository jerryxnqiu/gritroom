import { ensureOwnerFamily, getSession } from "@/lib/auth";
import { getSessionTokenFromCookies, json, readJson } from "@/lib/http";
import { env } from "cloudflare:workers";
import { nowIso } from "@/lib/time";
import { sha256Hex } from "@/lib/crypto";

export async function POST(request: Request) {
  const token = await getSessionTokenFromCookies();
  const session = await getSession(token);
  if (!session || session.entry !== "parent") {
    return json({ error: "Parent sign-in required." }, { status: 401 });
  }

  const body = await readJson<{ nickname?: string; examGoal?: "selective" | "oc" }>(request);
  const nickname = (body?.nickname ?? "").trim();
  const examGoal = body?.examGoal === "oc" ? "oc" : body?.examGoal === "selective" ? "selective" : null;

  if (!nickname || nickname.length > 40 || !examGoal) {
    return json({ error: "Provide a child’s nickname and exam goal (Selective or OC)." }, { status: 400 });
  }

  const familyId = await ensureOwnerFamily(session.user_id, session.email, nickname, examGoal);
  const profile = await env.DB.prepare(
    `SELECT id, nickname, exam_goal FROM profiles WHERE family_id = ? ORDER BY created_at ASC LIMIT 1`,
  )
    .bind(familyId)
    .first<{ id: string; nickname: string; exam_goal: string }>();

  if (token && profile) {
    const tokenHash = await sha256Hex(token);
    await env.DB.prepare(
      `UPDATE login_sessions SET family_id = ?, profile_id = ?, last_seen_at = ? WHERE token_hash = ?`,
    )
      .bind(familyId, profile.id, nowIso(), tokenHash)
      .run();
  }

  return json({
    ok: true,
    familyId,
    profile,
  });
}
