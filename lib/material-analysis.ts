import { deepseekChat } from "./deepseek.ts";
import type { ExamGoal } from "./family.ts";
import { createId } from "./ids.ts";
import { nowIso } from "./time.ts";
import { fetchYouTubeTranscript, youtubeVideoId } from "./youtube-transcript.ts";

const parentAccess = `EXISTS (
  SELECT 1 FROM guardian_grants g WHERE g.family_id = p.family_id AND g.user_id = ?
    AND g.revoked_at IS NULL
    AND (g.profile_id = p.id OR (g.profile_id IS NULL AND g.role IN ('owner', 'admin')))
)`;

export type MaterialAnalysis = {
  id: string;
  materialId: string;
  status: "running" | "succeeded" | "failed";
  summaryEn: string | null;
  parentZh: string | null;
  trainingDirections: string[];
  evidenceLimits: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
};

type MaterialRow = {
  id: string;
  kind: string;
  title: string;
  url: string | null;
  notes: string | null;
  fileName: string | null;
  examGoal: ExamGoal;
};

export async function listMaterialAnalyses(db: D1Database, profileId: string, goal: ExamGoal, userId: string) {
  const rows = await db.prepare(
    `SELECT a.id, a.material_id AS materialId, a.status, a.summary_en AS summaryEn, a.parent_zh AS parentZh,
            a.training_directions_json AS trainingJson, a.evidence_limits AS evidenceLimits,
            a.error, a.created_at AS createdAt, a.completed_at AS completedAt
     FROM material_analyses a
     JOIN profiles p ON p.id = a.profile_id
     WHERE a.profile_id = ? AND a.exam_goal = ? AND ${parentAccess}
       AND a.id = (
         SELECT a2.id FROM material_analyses a2
         WHERE a2.material_id = a.material_id
         ORDER BY a2.created_at DESC, a2.id DESC LIMIT 1
       )
     ORDER BY a.created_at DESC`,
  ).bind(profileId, goal, userId).all<{
    id: string;
    materialId: string;
    status: MaterialAnalysis["status"];
    summaryEn: string | null;
    parentZh: string | null;
    trainingJson: string | null;
    evidenceLimits: string | null;
    error: string | null;
    createdAt: string;
    completedAt: string | null;
  }>();

  return rows.results.map((row) => ({
    id: row.id,
    materialId: row.materialId,
    status: row.status,
    summaryEn: row.summaryEn,
    parentZh: row.parentZh,
    trainingDirections: parseDirections(row.trainingJson),
    evidenceLimits: row.evidenceLimits,
    error: row.error,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  })) satisfies MaterialAnalysis[];
}

export async function analyseMaterial(
  db: D1Database,
  profileId: string,
  materialId: string,
  userId: string,
  apiKey: string | null,
) {
  const material = await db.prepare(
    `SELECT m.id, m.kind, m.title, m.source_url AS url, m.notes, m.file_name AS fileName, m.exam_goal AS examGoal
     FROM shelf_materials m JOIN profiles p ON p.id = m.profile_id
     WHERE m.id = ? AND m.profile_id = ? AND ${parentAccess}`,
  ).bind(materialId, profileId, userId).first<MaterialRow>();
  if (!material) return { ok: false as const, status: 404 as const, error: "This resource is unavailable." };

  if (!apiKey) {
    return { ok: false as const, status: 503 as const, error: "DeepSeek is not configured on this Worker." };
  }

  const source = await resolveSourceText(material);
  if (!source.ok) {
    return { ok: false as const, status: source.status, error: source.error };
  }

  const analysisId = createId("anl");
  const stamp = nowIso();
  const reserved = await db.prepare(
    `INSERT INTO material_analyses
       (id, material_id, profile_id, exam_goal, status, source_excerpt, created_by_user_id, created_at)
     SELECT ?, m.id, m.profile_id, m.exam_goal, 'running', ?, ?, ?
     FROM shelf_materials m JOIN profiles p ON p.id = m.profile_id
     WHERE m.id = ? AND m.profile_id = ? AND ${parentAccess}`,
  ).bind(analysisId, source.excerpt, userId, stamp, materialId, profileId, userId).run();
  if (!reserved.meta.changes) return { ok: false as const, status: 404 as const, error: "This resource is unavailable." };

  const modelResult = await deepseekChat(apiKey, [
    {
      role: "system",
      content: [
        "You analyse Selective/OC Thinking Skills coaching materials for a private family learning room.",
        "Return JSON with keys: summary_en, parent_zh, training_directions (string array, max 5), evidence_limits.",
        "summary_en: short English summary of useful practice signals from the source.",
        "parent_zh: optional short Chinese parent reading; empty string if not useful.",
        "training_directions: concrete next practice directions, not invented missing questions.",
        "evidence_limits: what the source does NOT prove (guessing scores, classmate percentages, unseen items, truncated video coverage).",
        "If the source is a video transcript, treat it as spoken coaching content and extract methods, traps and practice focus.",
        "Never invent specific exam questions that are not present in the source text.",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        `Exam archive: ${material.examGoal}`,
        `Resource type: ${material.kind}`,
        `Title: ${material.title}`,
        material.url ? `Link: ${material.url}` : null,
        material.fileName ? `Attachment: ${material.fileName}` : null,
        `Source kind: ${source.kind}`,
        source.meta,
        "Source text:",
        source.excerpt,
      ].filter(Boolean).join("\n"),
    },
  ]);

  const done = nowIso();
  if (!modelResult.ok) {
    await db.prepare(
      `UPDATE material_analyses SET status = 'failed', error = ?, model = ?, completed_at = ?
       WHERE id = ? AND status = 'running'`,
    ).bind(modelResult.error, modelResult.model, done, analysisId).run();
    return { ok: false as const, status: 502 as const, error: modelResult.error };
  }

  let parsed: {
    summary_en?: unknown;
    parent_zh?: unknown;
    training_directions?: unknown;
    evidence_limits?: unknown;
  };
  try {
    parsed = JSON.parse(modelResult.content) as typeof parsed;
  } catch {
    await db.prepare(
      `UPDATE material_analyses SET status = 'failed', error = ?, model = ?, completed_at = ?
       WHERE id = ? AND status = 'running'`,
    ).bind("The AI service returned an unreadable analysis.", modelResult.model, done, analysisId).run();
    return { ok: false as const, status: 502 as const, error: "The AI service returned an unreadable analysis." };
  }

  const summaryEn = cleanText(parsed.summary_en, 4000);
  const parentZh = cleanText(parsed.parent_zh, 2000) || null;
  const evidenceLimits = cleanText(parsed.evidence_limits, 2000);
  const directions = Array.isArray(parsed.training_directions)
    ? parsed.training_directions.map((item) => cleanText(item, 240)).filter(Boolean).slice(0, 5)
    : [];

  if (!summaryEn || !evidenceLimits) {
    await db.prepare(
      `UPDATE material_analyses SET status = 'failed', error = ?, model = ?, completed_at = ?
       WHERE id = ? AND status = 'running'`,
    ).bind("The AI analysis was incomplete.", modelResult.model, done, analysisId).run();
    return { ok: false as const, status: 502 as const, error: "The AI analysis was incomplete." };
  }

  const evidenceId = createId("evd");
  await db.batch([
    db.prepare(
      `UPDATE material_analyses
       SET status = 'succeeded', summary_en = ?, parent_zh = ?, training_directions_json = ?,
           evidence_limits = ?, model = ?, completed_at = ?
       WHERE id = ? AND status = 'running'`,
    ).bind(summaryEn, parentZh, JSON.stringify(directions), evidenceLimits, modelResult.model, done, analysisId),
    db.prepare(
      `INSERT INTO learning_evidence (id, profile_id, exam_goal, kind, ref_id, summary, created_at)
       VALUES (?, ?, ?, 'material_analysis', ?, ?, ?)`,
    ).bind(evidenceId, profileId, material.examGoal, analysisId, summaryEn, done),
  ]);

  return {
    ok: true as const,
    analysis: {
      id: analysisId,
      materialId,
      status: "succeeded" as const,
      summaryEn,
      parentZh,
      trainingDirections: directions,
      evidenceLimits,
      error: null,
      createdAt: stamp,
      completedAt: done,
    },
  };
}

async function resolveSourceText(material: MaterialRow) {
  const notes = material.notes?.trim() ?? "";
  const video = material.url ? youtubeVideoId(material.url) : null;

  if (video && material.url) {
    const transcript = await fetchYouTubeTranscript(material.url);
    if (!transcript.ok) {
      if (notes) {
        return {
          ok: true as const,
          excerpt: notes.slice(0, 7500),
          kind: "parent notes (video captions unavailable)",
          meta: `Caption error: ${transcript.error}`,
        };
      }
      return { ok: false as const, status: 422 as const, error: transcript.error };
    }
    const excerpt = [
      notes ? `Parent notes:\n${notes}` : null,
      `YouTube transcript (${transcript.language}${transcript.autoGenerated ? ", auto-generated" : ""}${transcript.truncated ? ", truncated" : ""}):\n${transcript.text}`,
    ].filter(Boolean).join("\n\n").slice(0, 8000);
    return {
      ok: true as const,
      excerpt,
      kind: "youtube transcript",
      meta: `Caption language: ${transcript.language}; auto-generated: ${transcript.autoGenerated ? "yes" : "no"}; truncated: ${transcript.truncated ? "yes" : "no"}`,
    };
  }

  if (material.url && (material.kind === "coaching_video" || /\.(mp4|mov|webm)(\?|$)/i.test(material.url))) {
    if (notes) {
      return {
        ok: true as const,
        excerpt: notes.slice(0, 7500),
        kind: "parent notes (non-YouTube video)",
        meta: "Direct video file analysis is not available yet. Parent notes were used.",
      };
    }
    return {
      ok: false as const,
      status: 422 as const,
      error: "Video analysis currently reads YouTube captions automatically. Use a YouTube link, or add a transcript in notes.",
    };
  }

  if (notes) {
    return {
      ok: true as const,
      excerpt: notes.slice(0, 7500),
      kind: "parent notes",
      meta: material.fileName ? `Attachment on file: ${material.fileName}` : "Text notes only",
    };
  }

  return {
    ok: false as const,
    status: 400 as const,
    error: "Add notes that describe this resource, or use a YouTube link with captions. PDF page-image analysis comes next.",
  };
}

function cleanText(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function parseDirections(raw: string | null) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
