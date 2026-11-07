import { sha256Hex } from "./crypto.ts";
import { createId } from "./ids.ts";
import { daysFromNow, nowIso } from "./time.ts";
import type { ExamGoal } from "./family";

export type InviteRole = "learner" | "guardian";
export type InviteActor = { user_id: string; email: string };
export type ChildAccess = {
  learnerEmail: string | null;
  pending: { id: string; email: string; role: InviteRole; status: "sending" | "sent" | "unavailable"; expiresAt: string }[];
  guardians: { id: string; email: string }[];
};
export type RecipientInvite = {
  id: string;
  role: InviteRole;
  nickname: string;
  examGoal: ExamGoal;
  familyName: string;
  inviterEmail: string;
  expiresAt: string;
};

const error = (status: number, message: string) => ({ ok: false as const, status, message });

export async function childAccess(db: D1Database, profileId: string, userId: string): Promise<ChildAccess | null> {
  const authority = "EXISTS (SELECT 1 FROM profile_access_managers m WHERE m.profile_id = ? AND m.user_id = ?)";
  const [profile, pending, guardians] = await Promise.all([
    db.prepare(`SELECT u.email FROM profiles p LEFT JOIN learner_links l ON l.profile_id = p.id
      LEFT JOIN users u ON u.id = l.user_id WHERE p.id = ? AND ${authority}`)
      .bind(profileId, profileId, userId).first<{ email: string | null }>(),
    db.prepare(`SELECT id, email, role, expires_at AS expiresAt,
      CASE WHEN delivery_status = 'sent' AND NOT EXISTS (
        SELECT 1 FROM open_family_invites i WHERE i.id = family_invites.id
      ) THEN 'unavailable' ELSE delivery_status END AS status
      FROM family_invites WHERE profile_id = ? AND role IN ('learner', 'guardian')
        AND delivery_status IN ('sending', 'sent') AND accepted_at IS NULL AND revoked_at IS NULL
        AND julianday(expires_at) > julianday('now') AND ${authority}
      ORDER BY created_at DESC, id`)
      .bind(profileId, profileId, userId).all<ChildAccess["pending"][number]>(),
    db.prepare(`SELECT MIN(g.id) AS id, u.email FROM guardian_grants g
      JOIN users u ON u.id = g.user_id
      JOIN profiles p ON p.id = g.profile_id AND p.family_id = g.family_id
      WHERE g.profile_id = ? AND g.role = 'guardian' AND g.revoked_at IS NULL AND ${authority}
      GROUP BY g.user_id ORDER BY u.email`)
      .bind(profileId, profileId, userId).all<ChildAccess["guardians"][number]>(),
  ]);
  return profile ? { learnerEmail: profile.email, pending: pending.results, guardians: guardians.results } : null;
}

export async function recipientInvitations(db: D1Database, actor: InviteActor) {
  const { results } = await db.prepare(
    `SELECT i.id, i.role, p.nickname, p.exam_goal AS examGoal, f.name AS familyName,
       inviter.email AS inviterEmail, i.expires_at AS expiresAt
     FROM open_family_invites i JOIN profiles p ON p.id = i.profile_id
     JOIN families f ON f.id = i.family_id JOIN users inviter ON inviter.id = i.created_by_user_id
     JOIN users recipient ON recipient.email = i.email
     WHERE recipient.id = ? AND i.email = ?
     ORDER BY i.created_at DESC, i.id`,
  ).bind(actor.user_id, actor.email).all<RecipientInvite>();
  return results;
}

export async function issueInvitation(
  db: D1Database,
  actor: InviteActor,
  input: { profileId: string; email: string; role: InviteRole },
  deliver: () => Promise<boolean>,
) {
  if (input.email === actor.email) return error(400, "Use the recipient’s own email address.");

  const id = createId("inv");
  const stamp = nowIso();
  const expires = daysFromNow(7);
  const tokenHash = await sha256Hex(id);
  // Reserve a pending invite in the same statement that checks authority,
  // identity conflicts, and the send budget. The invite is not redeemable yet.
  const inserted = await db.prepare(
    `WITH candidate AS (
       SELECT p.id AS profile_id, p.family_id, ? AS email, ? AS role
       FROM profiles p WHERE p.id = ?
     )
     INSERT INTO family_invites (id, family_id, profile_id, email, role, token_hash,
       expires_at, created_by_user_id, created_at, delivery_status)
     SELECT ?, i.family_id, i.profile_id, i.email, i.role, ?, ?, ?, ?, 'sending'
     FROM candidate i WHERE EXISTS (
       SELECT 1 FROM profile_access_managers m WHERE m.profile_id = i.profile_id AND m.user_id = ?
     )
     AND NOT EXISTS (
       SELECT 1 FROM learner_links l JOIN users u ON u.id = l.user_id WHERE u.email = i.email COLLATE NOCASE
     )
     AND (i.role <> 'learner' OR NOT EXISTS (
       SELECT 1 FROM learner_links l WHERE l.profile_id = i.profile_id
     ))
     AND NOT EXISTS (
       SELECT 1 FROM users u JOIN guardian_grants g ON g.user_id = u.id AND g.revoked_at IS NULL
       WHERE u.email = i.email COLLATE NOCASE AND (i.role = 'learner' OR (
         g.family_id = i.family_id AND (g.profile_id = i.profile_id
           OR (g.profile_id IS NULL AND g.role IN ('owner', 'admin')))
       ))
     )
     AND NOT EXISTS (
       SELECT 1 FROM family_invites existing WHERE existing.profile_id = i.profile_id
         AND existing.role = i.role AND (i.role = 'learner' OR existing.email = i.email)
         AND existing.delivery_status IN ('sending', 'sent')
         AND existing.revoked_at IS NULL AND existing.accepted_at IS NULL
         AND julianday(existing.expires_at) > julianday('now')
     )
     AND (SELECT COUNT(*) FROM family_invites recent WHERE recent.created_by_user_id = ?
       AND julianday(recent.created_at) > julianday('now', '-1 hour')) < 20
     AND (SELECT COUNT(*) FROM family_invites recent WHERE recent.created_by_user_id = ?
       AND recent.email = i.email AND julianday(recent.created_at) > julianday('now', '-1 hour')) < 5`,
  ).bind(input.email, input.role, input.profileId, id, tokenHash, expires, actor.user_id, stamp,
    actor.user_id, actor.user_id, actor.user_id).run();

  if (!inserted.meta.changes) {
    const allowed = await db.prepare("SELECT 1 FROM profile_access_managers WHERE profile_id = ? AND user_id = ?")
      .bind(input.profileId, actor.user_id).first();
    return allowed
      ? error(409, "Could not send this invitation. Check the address, cancel any pending invitation for this recipient, or try again later.")
      : error(403, "You cannot manage invitations for this child.");
  }

  let sent = false;
  try {
    sent = await deliver();
  } catch {
    // Keep the failure in the invitation state without exposing SMTP details.
  }
  const [delivery] = await db.batch([
    db.prepare(`UPDATE family_invites SET delivery_status = ?
      WHERE id = ? AND delivery_status = 'sending' AND revoked_at IS NULL`)
      .bind(sent ? "sent" : "failed", id),
    db.prepare(`INSERT INTO account_events (id, family_id, user_id, profile_id, event_type, created_at)
      SELECT ?, family_id, ?, profile_id, ?, ? FROM family_invites WHERE id = ? AND changes() > 0`)
      .bind(createId("evt"), actor.user_id, sent ? "invitation_sent" : "invitation_delivery_failed", nowIso(), id),
  ]);

  if (!delivery.meta.changes) return error(409, "This invitation was cancelled.");
  if (!sent) return error(502, "We couldn’t send the invitation email. Check the mail connection and try again.");
  return { ok: true as const, id };
}

export async function acceptInvitation(db: D1Database, actor: InviteActor, inviteId: string) {
  const row = await db.prepare(
    `UPDATE family_invites SET accepted_at = ?, accepted_by_user_id = ?
     WHERE id = ? AND EXISTS (
       SELECT 1 FROM open_family_invites i JOIN users u ON u.email = i.email
       WHERE i.id = family_invites.id AND i.email = ? AND u.id = ?
     ) RETURNING role, profile_id AS profileId`,
  ).bind(nowIso(), actor.user_id, inviteId, actor.email, actor.user_id)
    .first<{ role: InviteRole; profileId: string }>();
  return row ? { ok: true as const, ...row } : error(404, "This invitation is no longer available.");
}

export async function closeInvitation(db: D1Database, actor: InviteActor, inviteId: string, action: "cancel" | "decline") {
  const scope = action === "cancel"
    ? `EXISTS (SELECT 1 FROM profile_access_managers m WHERE m.profile_id = family_invites.profile_id
        AND m.family_id = family_invites.family_id AND m.user_id = ?)`
    : `EXISTS (SELECT 1 FROM users u WHERE u.id = ? AND u.email = family_invites.email)
        AND delivery_status = 'sent'`;
  const { meta } = await db.prepare(
    `UPDATE family_invites SET revoked_at = ?, revoked_by_user_id = ?
     WHERE id = ? AND role IN ('learner', 'guardian') AND accepted_at IS NULL AND revoked_at IS NULL AND ${scope}`,
  ).bind(nowIso(), actor.user_id, inviteId, actor.user_id).run();
  return meta.changes ? { ok: true as const } : error(404, "This invitation is no longer available.");
}

export async function revokeGuardian(db: D1Database, actor: InviteActor, grantId: string) {
  const { meta } = await db.prepare(
    `UPDATE guardian_grants SET revoked_at = ?, revoked_by_user_id = ?
     WHERE role = 'guardian' AND revoked_at IS NULL AND EXISTS (
       SELECT 1 FROM guardian_grants target JOIN profile_access_managers m
         ON m.profile_id = target.profile_id AND m.family_id = target.family_id
       WHERE target.id = ? AND target.role = 'guardian' AND m.user_id = ?
         AND target.user_id = guardian_grants.user_id AND target.family_id = guardian_grants.family_id
         AND target.profile_id = guardian_grants.profile_id
     )`,
  ).bind(nowIso(), actor.user_id, grantId, actor.user_id).run();
  return meta.changes ? { ok: true as const } : error(404, "This guardian access is no longer available.");
}
