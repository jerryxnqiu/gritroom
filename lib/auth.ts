import { env } from "cloudflare:workers";

import { randomDigits, randomToken, sha256Hex } from "./crypto";
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

type ChallengeResult =
  | { ok: true; neutralMessage: string; debugCode?: string }
  | { ok: false; error: string; status: number };

type VerifyResult =
  | {
      ok: true;
      token: string;
      userId: string;
      entry: EntryKind;
      needsOnboarding: boolean;
    }
  | { ok: false; error: string; status: number };

const CODE_TTL_MINUTES = 10;
const SESSION_DAYS = 30;
const MAX_SENDS_PER_HOUR = 5;

export async function requestSignInCode(input: {
  email: string;
  entry: EntryKind;
  ip: string | null;
  ua: string | null;
}): Promise<ChallengeResult> {
  const email = input.email;
  const recent = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM login_challenges
     WHERE email = ? AND created_at > datetime('now', '-1 hour')`,
  )
    .bind(email)
    .first<{ count: number }>();

  if ((recent?.count ?? 0) >= MAX_SENDS_PER_HOUR) {
    return {
      ok: false,
      error: "Too many sign-in codes requested. Please wait and try again.",
      status: 429,
    };
  }

  const code = randomDigits(6);
  const codeHash = await sha256Hex(code);
  const challengeId = createId("chl");

  await env.DB.prepare(
    `INSERT INTO login_challenges
      (id, email, entry, code_hash, expires_at, request_ip, request_ua, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(challengeId, email, input.entry, codeHash, minutesFromNow(CODE_TTL_MINUTES), input.ip, input.ua, nowIso())
    .run();

  const mail = await sendEmail({
    db: env.DB,
    purpose: "login-code",
    to: email,
    subject: "Your GritRoom sign-in code",
    text: [
      `Your GritRoom sign-in code is ${code}.`,
      "",
      `It expires in ${CODE_TTL_MINUTES} minutes.`,
      "If you did not request this code, you can ignore this email.",
    ].join("\n"),
  });

  // Neutral client message — do not reveal whether the mailbox is known.
  const neutralMessage = "If that email can receive mail, a sign-in code is on its way.";

  if (!mail.ok) {
    // Keep internal distinction: request accepted by app, SMTP failed.
    return {
      ok: true,
      neutralMessage: `${neutralMessage} (Delivery could not be confirmed yet. Reference: ${challengeId.slice(-8)})`,
      debugCode: process.env.NODE_ENV === "production" ? undefined : code,
    };
  }

  return {
    ok: true,
    neutralMessage,
    debugCode: process.env.NODE_ENV === "production" ? undefined : code,
  };
}

export async function verifySignInCode(input: {
  email: string;
  entry: EntryKind;
  code: string;
}): Promise<VerifyResult> {
  const challenge = await env.DB.prepare(
    `SELECT * FROM login_challenges
     WHERE email = ? AND entry = ? AND consumed_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
  )
    .bind(input.email, input.entry)
    .first<{
      id: string;
      code_hash: string;
      attempts: number;
      max_attempts: number;
      expires_at: string;
    }>();

  if (!challenge) {
    return { ok: false, error: "No active sign-in code. Request a new one.", status: 400 };
  }
  if (isExpired(challenge.expires_at)) {
    return { ok: false, error: "That code has expired. Request a new one.", status: 400 };
  }
  if (challenge.attempts >= challenge.max_attempts) {
    return { ok: false, error: "Too many incorrect attempts. Request a new code.", status: 400 };
  }

  const codeHash = await sha256Hex(input.code.trim());
  if (codeHash !== challenge.code_hash) {
    await env.DB.prepare(`UPDATE login_challenges SET attempts = attempts + 1 WHERE id = ?`)
      .bind(challenge.id)
      .run();
    return { ok: false, error: "That code is incorrect.", status: 400 };
  }

  await env.DB.prepare(`UPDATE login_challenges SET consumed_at = ? WHERE id = ?`)
    .bind(nowIso(), challenge.id)
    .run();

  let user = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(input.email).first<{ id: string }>();
  if (!user) {
    const userId = createId("usr");
    await env.DB.prepare(`INSERT INTO users (id, email, created_at, updated_at) VALUES (?, ?, ?, ?)`)
      .bind(userId, input.email, nowIso(), nowIso())
      .run();
    user = { id: userId };
  }

  const grant = await env.DB.prepare(
    `SELECT family_id, profile_id, role FROM guardian_grants
     WHERE user_id = ? AND revoked_at IS NULL
     ORDER BY created_at ASC
     LIMIT 1`,
  )
    .bind(user.id)
    .first<{ family_id: string; profile_id: string | null; role: string }>();

  const invite = await env.DB.prepare(
    `SELECT id, family_id, profile_id, role FROM family_invites
     WHERE email = ? AND revoked_at IS NULL AND accepted_at IS NULL AND expires_at > ?
     ORDER BY created_at DESC
     LIMIT 1`,
  )
    .bind(input.email, nowIso())
    .first<{ id: string; family_id: string; profile_id: string | null; role: string }>();

  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const sessionId = createId("ses");
  const expiresAt = minutesFromNow(SESSION_DAYS * 24 * 60);

  await env.DB.prepare(
    `INSERT INTO login_sessions
      (id, user_id, entry, token_hash, profile_id, family_id, expires_at, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      sessionId,
      user.id,
      input.entry,
      tokenHash,
      grant?.profile_id ?? invite?.profile_id ?? null,
      grant?.family_id ?? invite?.family_id ?? null,
      expiresAt,
      nowIso(),
      nowIso(),
    )
    .run();

  await env.DB.prepare(
    `INSERT INTO account_events (id, family_id, user_id, profile_id, event_type, detail_json, created_at)
     VALUES (?, ?, ?, ?, 'login', ?, ?)`,
  )
    .bind(
      createId("evt"),
      grant?.family_id ?? invite?.family_id ?? null,
      user.id,
      grant?.profile_id ?? invite?.profile_id ?? null,
      JSON.stringify({ entry: input.entry }),
      nowIso(),
    )
    .run();

  return {
    ok: true,
    token,
    userId: user.id,
    entry: input.entry,
    needsOnboarding: input.entry === "parent" ? !grant : !grant && !invite,
  };
}

export async function getSession(token: string | null): Promise<SessionRow | null> {
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT s.id, s.user_id, s.entry, u.email, s.profile_id, s.family_id, s.expires_at, s.revoked_at
     FROM login_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?
     LIMIT 1`,
  )
    .bind(tokenHash)
    .first<SessionRow>();

  if (!row || row.revoked_at || isExpired(row.expires_at)) return null;

  await env.DB.prepare(`UPDATE login_sessions SET last_seen_at = ? WHERE id = ?`).bind(nowIso(), row.id).run();
  return row;
}

export async function revokeSession(token: string | null): Promise<void> {
  if (!token) return;
  const tokenHash = await sha256Hex(token);
  await env.DB.prepare(`UPDATE login_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL`)
    .bind(nowIso(), tokenHash)
    .run();
}

export async function ensureOwnerFamily(userId: string, email: string, nickname: string, examGoal: "selective" | "oc") {
  const existing = await env.DB.prepare(
    `SELECT family_id FROM guardian_grants WHERE user_id = ? AND role = 'owner' AND revoked_at IS NULL LIMIT 1`,
  )
    .bind(userId)
    .first<{ family_id: string }>();
  if (existing) return existing.family_id;

  const familyId = createId("fam");
  const profileId = createId("prf");
  const grantId = createId("grn");
  const stamp = nowIso();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO families (id, name, installation_owner_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(familyId, `${nickname}'s family`, userId, stamp, stamp),
    env.DB.prepare(
      `INSERT INTO profiles (id, family_id, nickname, exam_goal, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(profileId, familyId, nickname, examGoal, stamp, stamp),
    env.DB.prepare(
      `INSERT INTO guardian_grants (id, family_id, user_id, profile_id, role, created_at)
       VALUES (?, ?, ?, NULL, 'owner', ?)`,
    ).bind(grantId, familyId, userId, stamp),
    env.DB.prepare(
      `INSERT INTO account_events (id, family_id, user_id, profile_id, event_type, detail_json, created_at)
       VALUES (?, ?, ?, ?, 'family_created', ?, ?)`,
    ).bind(createId("evt"), familyId, userId, profileId, JSON.stringify({ email }), stamp),
  ]);

  return familyId;
}
