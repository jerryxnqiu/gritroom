export type ExamGoal = "selective" | "oc";

export type ParentProfile = {
  id: string;
  familyId: string;
  familyName: string;
  nickname: string;
  examGoal: ExamGoal;
  canManage: number;
};

export type ManagedFamily = { id: string; name: string };

export const examLabel = (goal: ExamGoal) => (goal === "oc" ? "OC" : "Selective");

export function parseProfileInput(value: unknown): { nickname: string; examGoal: ExamGoal } | null {
  if (!value || typeof value !== "object") return null;
  const input = value as { nickname?: unknown; examGoal?: unknown };
  const nickname = typeof input.nickname === "string" ? input.nickname.trim() : "";
  if (!nickname || nickname.length > 40 || (input.examGoal !== "selective" && input.examGoal !== "oc")) return null;
  return { nickname, examGoal: input.examGoal };
}

export async function listParentProfiles(db: D1Database, userId: string) {
  const { results } = await db.prepare(
    `SELECT p.id, p.family_id AS familyId, f.name AS familyName,
            p.nickname, p.exam_goal AS examGoal,
            MAX(CASE WHEN g.role IN ('owner', 'admin') THEN 1 ELSE 0 END) AS canManage
     FROM profiles p
     JOIN families f ON f.id = p.family_id
     JOIN guardian_grants g ON g.family_id = p.family_id AND g.user_id = ? AND g.revoked_at IS NULL
       AND (g.profile_id = p.id OR (g.profile_id IS NULL AND g.role IN ('owner', 'admin')))
     GROUP BY p.id ORDER BY p.created_at, p.id`,
  ).bind(userId).all<ParentProfile>();
  return results;
}

export async function listManagedFamilies(db: D1Database, userId: string) {
  const { results } = await db.prepare(
    `SELECT DISTINCT f.id, f.name FROM families f
     JOIN guardian_grants g ON g.family_id = f.id
     WHERE g.user_id = ? AND g.revoked_at IS NULL AND g.profile_id IS NULL
       AND g.role IN ('owner', 'admin')
     ORDER BY f.created_at, f.id`,
  ).bind(userId).all<ManagedFamily>();
  return results;
}

export async function linkedLearner(db: D1Database, userId: string) {
  return db.prepare(
    `SELECT p.id, p.family_id AS familyId, p.nickname, p.exam_goal AS examGoal
     FROM learner_links l JOIN profiles p ON p.id = l.profile_id WHERE l.user_id = ?`,
  ).bind(userId).first<Omit<ParentProfile, "familyName" | "canManage">>();
}

export async function hasLearnerInvitation(db: D1Database, email: string) {
  return Boolean(await db.prepare(
    "SELECT 1 FROM open_family_invites WHERE email = ? AND role = 'learner' LIMIT 1",
  ).bind(email).first());
}

export async function hasOpenInvitations(db: D1Database, email: string) {
  return Boolean(await db.prepare(
    "SELECT 1 FROM open_family_invites WHERE email = ? LIMIT 1",
  ).bind(email).first());
}

export async function isInstallationOwner(db: D1Database, userId: string) {
  return Boolean(await db.prepare(
    `SELECT 1 FROM settings
     WHERE key = 'installation_owner_user_id' AND json_valid(value_json)
       AND json_extract(value_json, '$') = ?`,
  ).bind(userId).first());
}
