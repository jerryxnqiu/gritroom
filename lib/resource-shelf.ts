import type { ExamGoal } from "./family";
import type { MaterialKind, parseMaterial } from "./shelf-fields";
import type { PracticeSubject } from "./subjects";
import { createId } from "./ids.ts";
import { nowIso } from "./time.ts";

type MaterialInput = Exclude<Awaited<ReturnType<typeof parseMaterial>>, { error: string }>;

export type ShelfMaterial = {
  id: string;
  kind: MaterialKind;
  title: string;
  url: string | null;
  notes: string | null;
  fileName: string | null;
  fileType: string | null;
  createdAt: string;
};
export type ShelfFeedback = { id: string; body: string; authorId: string; createdAt: string };

// The profile is the privacy boundary, including between children in one family.
// The archive goal is separate so a profile can retain materials after changing goals.
const parentAccess = `EXISTS (
  SELECT 1 FROM guardian_grants g WHERE g.family_id = p.family_id AND g.user_id = ?
    AND g.revoked_at IS NULL
    AND (g.profile_id = p.id OR (g.profile_id IS NULL AND g.role IN ('owner', 'admin')))
)`;

export function canOpenShelf(db: D1Database, profileId: string, userId: string) {
  return db.prepare(`SELECT 1 FROM profiles p WHERE p.id = ? AND ${parentAccess}`)
    .bind(profileId, userId).first();
}

export async function readShelf(
  db: D1Database,
  profileId: string,
  goal: ExamGoal,
  userId: string,
  subject: PracticeSubject = "thinking",
) {
  const [materials, feedback] = await Promise.all([
    db.prepare(
      `SELECT m.id, m.kind, m.title, m.source_url AS url, m.notes, m.file_name AS fileName,
              m.file_type AS fileType, m.created_at AS createdAt
       FROM shelf_materials m JOIN profiles p ON p.id = m.profile_id
       WHERE m.profile_id = ? AND m.exam_goal = ? AND m.subject = ? AND ${parentAccess}
       ORDER BY m.created_at DESC, m.id DESC`,
    ).bind(profileId, goal, subject, userId).all<ShelfMaterial>(),
    db.prepare(
      `SELECT f.id, f.body, f.created_by_user_id AS authorId, f.created_at AS createdAt
       FROM shelf_feedback f JOIN profiles p ON p.id = f.profile_id
       WHERE f.profile_id = ? AND f.exam_goal = ? AND f.subject = ? AND f.withdrawn_at IS NULL AND ${parentAccess}
       ORDER BY f.created_at DESC, f.id DESC`,
    ).bind(profileId, goal, subject, userId).all<ShelfFeedback>(),
  ]);
  return { materials: materials.results, feedback: feedback.results };
}

export async function saveMaterial(db: D1Database, bucket: R2Bucket, profileId: string, userId: string, input: MaterialInput) {
  const id = createId("mat");
  const { file } = input;
  const key = file ? `resource-shelf/${profileId}/${id}` : null;
  if (file && key) await bucket.put(key, await file.arrayBuffer());

  const inserted = await db.prepare(
    `INSERT INTO shelf_materials
       (id, profile_id, exam_goal, subject, kind, title, source_url, notes, file_key, file_name, file_type, created_by_user_id, created_at)
     SELECT ?, p.id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM profiles p WHERE p.id = ? AND ${parentAccess}`,
  ).bind(
    id, input.goal, input.subject, input.kind, input.title, input.url, input.notes, key,
    file?.name.slice(0, 180) ?? null, file?.type ?? null, userId, nowIso(), profileId, userId,
  ).run();

  if (inserted.meta.changes) return id;
  if (key) await bucket.delete(key);
  return null;
}

export function findMaterialFile(db: D1Database, profileId: string, materialId: string, userId: string) {
  return db.prepare(
    `SELECT m.file_key AS key, m.file_name AS name, m.file_type AS type
     FROM shelf_materials m JOIN profiles p ON p.id = m.profile_id
     WHERE p.id = ? AND m.id = ? AND m.file_key IS NOT NULL AND ${parentAccess}`,
  ).bind(profileId, materialId, userId).first<{ key: string; name: string; type: string }>();
}

export async function deleteMaterial(db: D1Database, bucket: R2Bucket, profileId: string, materialId: string, userId: string) {
  const allowed = await db.prepare(
    `SELECT m.file_key AS key FROM shelf_materials m
     JOIN profiles p ON p.id = m.profile_id
     WHERE m.id = ? AND m.profile_id = ? AND ${parentAccess}`,
  ).bind(materialId, profileId, userId).first<{ key: string | null }>();
  if (!allowed) return false;

  // Drop shelf row, its analyses, and generation copies that pointed at those analyses.
  await db.batch([
    db.prepare(
      `DELETE FROM learning_evidence
       WHERE kind = 'material_analysis'
         AND ref_id IN (SELECT id FROM material_analyses WHERE material_id = ?)`,
    ).bind(materialId),
    db.prepare(`DELETE FROM material_analyses WHERE material_id = ?`).bind(materialId),
    db.prepare(
      `DELETE FROM shelf_materials WHERE id = ? AND profile_id = ?`,
    ).bind(materialId, profileId),
  ]);

  if (allowed.key) await bucket.delete(allowed.key);
  return true;
}

export async function saveShelfFeedback(
  db: D1Database,
  profileId: string,
  goal: ExamGoal,
  userId: string,
  body: string,
  subject: PracticeSubject = "thinking",
) {
  const id = createId("fdb");
  const stamp = nowIso();
  const result = await db.prepare(
    `INSERT INTO shelf_feedback (id, profile_id, exam_goal, subject, body, created_by_user_id, created_at)
     SELECT ?, p.id, ?, ?, ?, ?, ? FROM profiles p WHERE p.id = ? AND ${parentAccess}`,
  ).bind(id, goal, subject, body, userId, stamp, profileId, userId).run();
  if (!result.meta.changes) return null;
  await db.prepare(
    `INSERT INTO learning_evidence (id, profile_id, exam_goal, subject, kind, ref_id, summary, created_at)
     VALUES (?, ?, ?, ?, 'parent_feedback', ?, ?, ?)`,
  ).bind(createId("evd"), profileId, goal, subject, id, body.slice(0, 4000), stamp).run();
  return id;
}

export async function withdrawShelfFeedback(db: D1Database, profileId: string, feedbackId: string, userId: string) {
  const result = await db.prepare(
    `UPDATE shelf_feedback AS f SET withdrawn_at = ?
     WHERE f.id = ? AND f.profile_id = ? AND f.withdrawn_at IS NULL AND EXISTS (
       SELECT 1 FROM profiles p WHERE p.id = f.profile_id AND ${parentAccess}
         AND (f.created_by_user_id = ? OR EXISTS (
           SELECT 1 FROM guardian_grants g WHERE g.family_id = p.family_id AND g.user_id = ?
             AND g.revoked_at IS NULL AND g.role IN ('owner', 'admin')
             AND (g.profile_id IS NULL OR g.profile_id = p.id)
         ))
     )`,
  ).bind(nowIso(), feedbackId, profileId, userId, userId, userId).run();
  return Boolean(result.meta.changes);
}
