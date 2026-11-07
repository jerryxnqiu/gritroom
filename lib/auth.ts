import { env } from "cloudflare:workers";

import { randomDigits, randomToken, sha256Hex } from "./crypto";
import { hasLearnerInvitation, hasOpenInvitations, linkedLearner, listManagedFamilies, listParentProfiles } from "./family";
import type { ExamGoal } from "./family";
import { createId } from "./ids";
import { sendEmail } from "./smtp";
import { isExpired, minutesFromNow, nowIso } from "./time";

export type EntryKind = "learner" | "parent";

export type SessionRow = {
  id: string;
  user_id: string;
  entry: EntryKind;
  email: string;
  profile_id: string | null;
  family_id: string | null;
  expires_at: string;
  revoked_at: string | null;
};

type AuthError = { ok: false; error: string; status: number };
type ChallengeResult = { ok: true; message: string } | AuthError;
type VerifyResult = { ok: true; token: string; entry: EntryKind; needsOnboarding: boolean; hasInvitations: boolean } | AuthError;
const CODE_TTL_MINUTES = 10;
const SESSION_DAYS = 30;

async function parentScope(userId: string, preferredProfile?: string | null) {
  const [profiles, families] = await Promise.all([
    listParentProfiles(env.DB, userId),
    listManagedFamilies(env.DB, userId),
  ]);
  const profile = profiles.find((item) => item.id === preferredProfile) ?? profiles[0];
  return { profile_id: profile?.id ?? null, family_id: profile?.familyId ?? families[0]?.id ?? null };
}

async function resolveRoom(userId: string, email: string, entry: EntryKind, preferredProfile?: string | null) {
  const learner = await linkedLearner(env.DB, userId);
  if (learner) return { entry: "learner" as const, profile_id: learner.id, family_id: learner.familyId };
  const scope = await parentScope(userId, preferredProfile);
  if (scope.family_id) return { entry: "parent" as const, ...scope };
  const isLearner = entry === "learner" || await hasLearnerInvitation(env.DB, email);
  return { entry: isLearner ? "learner" as const : "parent" as const, ...scope };
}

export async function requestSignInCode(input: {
  email: string;
  entry: EntryKind;
  ip: string | null;
  ua: string | null;
}): Promise<ChallengeResult> {
  const code = randomDigits(6);
  const challengeId = createId("chl");
  const codeHash = await sha256Hex(code);
  const { meta } = await env.DB.prepare(
    `INSERT INTO login_challenges (id, email, entry, code_hash, expires_at, request_ip, request_ua, created_at)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?
     WHERE (SELECT COUNT(*) FROM login_challenges
            WHERE email = ? AND julianday(created_at) > julianday('now', '-1 hour')) < 5
       AND NOT EXISTS (SELECT 1 FROM login_challenges
                       WHERE email = ? AND julianday(created_at) > julianday('now', '-1 minute'))
       AND (? IS NULL OR (SELECT COUNT(*) FROM login_challenges
                         WHERE request_ip = ? AND julianday(created_at) > julianday('now', '-1 hour')) < 20)`,
  ).bind(
    challengeId, input.email, input.entry, codeHash, minutesFromNow(CODE_TTL_MINUTES),
    input.ip, input.ua?.slice(0, 256) ?? null, nowIso(), input.email, input.email, input.ip, input.ip,
  ).run();

  if (!meta.changes) {
    return { ok: false, error: "Please wait before requesting another sign-in code.", status: 429 };
  }

  const mail = await sendEmail({
    db: env.DB,
    purpose: "login-code",
    to: input.email,
    subject: "Your GritRoom sign-in code",
    text: [
      `Your GritRoom sign-in code is ${code}.`,
      "",
      `It expires in ${CODE_TTL_MINUTES} minutes.`,
      "If you did not request this code, you can ignore this email.",
    ].join("\n"),
  });

  if (!mail.ok) {
    await env.DB.prepare("UPDATE login_challenges SET consumed_at = ? WHERE id = ?")
      .bind(nowIso(), challengeId).run();
    return {
      ok: false,
      status: 502,
      error: `We couldn’t send the sign-in email. Try again in a moment. Reference: ${challengeId.slice(-8)}`,
    };
  }

  return { ok: true, message: "Check your inbox and spam folder. The code expires in 10 minutes." };
}

export async function verifySignInCode(input: {
  email: string;
  entry: EntryKind;
  code: string;
}): Promise<VerifyResult> {
  // Do not fall back to an older challenge once the latest has been used.
  const challenge = await env.DB.prepare(
    `SELECT id, code_hash, attempts, max_attempts, expires_at, consumed_at FROM login_challenges
     WHERE email = ? AND entry = ? ORDER BY julianday(created_at) DESC, rowid DESC LIMIT 1`,
  ).bind(input.email, input.entry).first<{
    id: string;
    code_hash: string;
    attempts: number;
    max_attempts: number;
    expires_at: string;
    consumed_at: string | null;
  }>();

  if (!challenge || challenge.consumed_at) {
    return { ok: false, error: "No active sign-in code. Request a new one.", status: 400 };
  }
  if (isExpired(challenge.expires_at)) {
    return { ok: false, error: "That code has expired. Request a new one.", status: 400 };
  }
  if (challenge.attempts >= challenge.max_attempts) {
    return { ok: false, error: "Too many incorrect attempts. Request a new code.", status: 400 };
  }

  const codeHash = await sha256Hex(input.code);
  if (codeHash !== challenge.code_hash) {
    await env.DB.prepare(
      "UPDATE login_challenges SET attempts = attempts + 1 WHERE id = ? AND consumed_at IS NULL AND attempts < max_attempts",
    ).bind(challenge.id).run();
    return { ok: false, error: "That code is incorrect.", status: 400 };
  }

  const used = await env.DB.prepare(
    `UPDATE login_challenges SET consumed_at = ?
     WHERE id = ? AND consumed_at IS NULL AND attempts < max_attempts
       AND julianday(expires_at) > julianday('now')
       AND id = (SELECT id FROM login_challenges WHERE email = ? AND entry = ?
                 ORDER BY julianday(created_at) DESC, rowid DESC LIMIT 1)
     RETURNING id`,
  ).bind(nowIso(), challenge.id, input.email, input.entry).first();
  if (!used) return { ok: false, error: "This code can no longer be used. Request a new one.", status: 400 };

  const stamp = nowIso();
  await env.DB.prepare(
    "INSERT INTO users (id, email, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO NOTHING",
  ).bind(createId("usr"), input.email, stamp, stamp).run();
  const user = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(input.email).first<{ id: string }>();
  if (!user) return { ok: false, error: "We couldn’t open your room. Please try again.", status: 500 };

  const scope = await resolveRoom(user.id, input.email, input.entry);
  const { entry } = scope;
  const hasInvitations = !scope.family_id && await hasOpenInvitations(env.DB, input.email);

  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const sessionId = createId("ses");
  const expiresAt = minutesFromNow(SESSION_DAYS * 24 * 60);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO login_sessions (id, user_id, entry, token_hash, profile_id, family_id, expires_at, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(sessionId, user.id, entry, tokenHash, scope.profile_id, scope.family_id, expiresAt, stamp, stamp),
    env.DB.prepare(
      `INSERT INTO account_events (id, family_id, user_id, profile_id, event_type, detail_json, created_at)
       VALUES (?, ?, ?, ?, 'login', ?, ?)`,
    ).bind(createId("evt"), scope.family_id, user.id, scope.profile_id, JSON.stringify({ entry }), stamp),
  ]);

  return { ok: true, token, entry, needsOnboarding: !scope.family_id, hasInvitations };
}

export async function getSession(token: string | null): Promise<SessionRow | null> {
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT s.id, s.user_id, s.entry, u.email, s.profile_id, s.family_id, s.expires_at, s.revoked_at
     FROM login_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? LIMIT 1`,
  ).bind(tokenHash).first<SessionRow>();

  if (!row || row.revoked_at || isExpired(row.expires_at)) return null;
  const scope = await resolveRoom(row.user_id, row.email, row.entry, row.profile_id);
  return { ...row, ...scope };
}

export async function revokeSession(token: string | null): Promise<void> {
  if (!token) return;
  const tokenHash = await sha256Hex(token);
  await env.DB.prepare("UPDATE login_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL")
    .bind(nowIso(), tokenHash).run();
}

export async function ensureOwnerFamily(userId: string, nickname: string, examGoal: ExamGoal) {
  const familyId = createId("fam");
  const profileId = createId("prf");
  const stamp = nowIso();

  // D1 executes the batch atomically. A concurrent request only creates one room.
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO families (id, name, installation_owner_user_id, created_at, updated_at)
       SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (
         SELECT 1 FROM families WHERE installation_owner_user_id = ?
       ) AND NOT EXISTS (SELECT 1 FROM learner_links WHERE user_id = ?)
       AND NOT EXISTS (
         SELECT 1 FROM open_family_invites i JOIN users u ON u.email = i.email
         WHERE u.id = ? AND i.role = 'learner'
       ) AND NOT EXISTS (
         SELECT 1 FROM guardian_grants g WHERE g.user_id = ? AND g.revoked_at IS NULL
       )`,
    ).bind(familyId, `${nickname}’s family`, userId, stamp, stamp, userId, userId, userId, userId),
    env.DB.prepare(
      `INSERT INTO profiles (id, family_id, nickname, exam_goal, created_at, updated_at)
       SELECT ?, id, ?, ?, ?, ? FROM families WHERE id = ?`,
    ).bind(profileId, nickname, examGoal, stamp, stamp, familyId),
    env.DB.prepare(
      `INSERT INTO guardian_grants (id, family_id, user_id, profile_id, role, created_at)
       SELECT ?, id, ?, NULL, 'owner', ? FROM families WHERE id = ?`,
    ).bind(createId("grn"), userId, stamp, familyId),
    env.DB.prepare(
      `INSERT INTO account_events (id, family_id, user_id, profile_id, event_type, created_at)
       SELECT ?, id, ?, ?, 'family_created', ? FROM families WHERE id = ?`,
    ).bind(createId("evt"), userId, profileId, stamp, familyId),
  ]);

  const family = await env.DB.prepare(
    `SELECT g.family_id FROM guardian_grants g
     WHERE g.user_id = ? AND g.role = 'owner' AND g.revoked_at IS NULL ORDER BY g.created_at LIMIT 1`,
  ).bind(userId).first<{ family_id: string }>();
  return family?.family_id ?? null;
}
