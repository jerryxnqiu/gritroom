import { deepseekChat, type DeepseekContentPart } from "./deepseek.ts";
import type { ExamGoal } from "./family.ts";
import { createId } from "./ids.ts";
import { type AnalysisPageImage, MAX_ANALYSIS_PAGES } from "./shelf-pages.ts";
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
  fileType: string | null;
  fileKey: string | null;
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
  bucket: R2Bucket,
  profileId: string,
  materialId: string,
  userId: string,
  apiKey: string | null,
  pageImages: AnalysisPageImage[] = [],
) {
  const material = await db.prepare(
    `SELECT m.id, m.kind, m.title, m.source_url AS url, m.notes, m.file_name AS fileName,
            m.file_type AS fileType, m.file_key AS fileKey, m.exam_goal AS examGoal
     FROM shelf_materials m JOIN profiles p ON p.id = m.profile_id
     WHERE m.id = ? AND m.profile_id = ? AND ${parentAccess}`,
  ).bind(materialId, profileId, userId).first<MaterialRow>();
  if (!material) return { ok: false as const, status: 404 as const, error: "This resource is unavailable." };

  if (!apiKey) {
    return { ok: false as const, status: 503 as const, error: "DeepSeek is not configured on this Worker." };
  }

  const images = await collectImages(bucket, material, pageImages);
  if (!images.ok) return { ok: false as const, status: images.status, error: images.error };

  const source = await resolveSourceText(material, images.pages);
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

  const userContent: DeepseekContentPart[] = [
    {
      type: "text",
      text: [
        `Exam archive: ${material.examGoal}`,
        `Resource type: ${material.kind}`,
        `Title: ${material.title}`,
        material.url ? `Link: ${material.url}` : null,
        material.fileName ? `Attachment: ${material.fileName}` : null,
        `Source kind: ${source.kind}`,
        source.meta,
        "Source text / context:",
        source.excerpt,
        images.pages.length
          ? `The following ${images.pages.length} page image(s) are part of this resource. Read visible text, diagrams and coaching marks carefully.`
          : null,
      ].filter(Boolean).join("\n"),
    },
    ...images.pages.map((page) => ({
      type: "image_url" as const,
      image_url: { url: page.dataUrl, detail: "high" as const },
    })),
  ];

  const modelResult = await deepseekChat(apiKey, [
    {
      role: "system",
      content: [
        "You analyse Selective/OC Thinking Skills coaching materials for a private family learning room.",
        "Return JSON with keys: summary_en, parent_zh, training_directions (string array, max 5), evidence_limits.",
        "summary_en: short English summary of useful practice signals from the source.",
        "parent_zh: optional short Chinese parent reading; empty string if not useful.",
        "training_directions: concrete next practice directions, not invented missing questions.",
        "evidence_limits: what the source does NOT prove (guessing scores, classmate percentages, unseen items, truncated pages or video).",
        "If images are provided, treat them as the primary evidence and extract methods, traps and practice focus from visible content.",
        "If the source is a video transcript, treat it as spoken coaching content.",
        "Never invent specific exam questions that are not present in the source text or images.",
      ].join(" "),
    },
    { role: "user", content: userContent },
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

async function collectImages(
  bucket: R2Bucket,
  material: MaterialRow,
  pageImages: AnalysisPageImage[],
) {
  if (pageImages.length) {
    if (pageImages.length > MAX_ANALYSIS_PAGES) {
      return {
        ok: false as const,
        status: 400 as const,
        error: `Analyse up to ${MAX_ANALYSIS_PAGES} PDF pages at a time. Split longer documents or choose the most relevant pages.`,
      };
    }
    return { ok: true as const, pages: pageImages };
  }

  if (material.fileKey && material.fileType && isVisionImage(material.fileType)) {
    const object = await bucket.get(material.fileKey);
    if (!object) {
      return { ok: false as const, status: 404 as const, error: "The attached image is unavailable." };
    }
    const bytes = new Uint8Array(await object.arrayBuffer());
    if (bytes.byteLength > 8 * 1024 * 1024) {
      return { ok: false as const, status: 413 as const, error: "Attached images for analysis must be 8 MB or smaller." };
    }
    const dataUrl = `data:${material.fileType};base64,${bytesToBase64(bytes)}`;
    return { ok: true as const, pages: [{ page: 1, dataUrl }] };
  }

  return { ok: true as const, pages: [] as AnalysisPageImage[] };
}

async function resolveSourceText(material: MaterialRow, pages: AnalysisPageImage[]) {
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

  if (pages.length) {
    const pageLabel = pages.map((page) => page.page).join(", ");
    return {
      ok: true as const,
      excerpt: [
        notes ? `Parent notes:\n${notes}` : null,
        `Page images provided for analysis: ${pageLabel}.`,
        material.fileType === "application/pdf" || material.fileName?.toLowerCase().endsWith(".pdf")
          ? `At most ${MAX_ANALYSIS_PAGES} PDF pages are analysed per request.`
          : null,
      ].filter(Boolean).join("\n\n").slice(0, 8000),
      kind: material.fileType === "application/pdf" || material.fileName?.toLowerCase().endsWith(".pdf")
        ? "pdf page images"
        : "attached image",
      meta: `Image count: ${pages.length}`,
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

  if (material.fileType === "application/pdf" || material.fileName?.toLowerCase().endsWith(".pdf")) {
    return {
      ok: false as const,
      status: 400 as const,
      error: `Prepare the first ${MAX_ANALYSIS_PAGES} PDF pages as images in the browser, then analyse again.`,
    };
  }

  return {
    ok: false as const,
    status: 400 as const,
    error: "Add notes, a YouTube link with captions, a PDF, or an image attachment to analyse.",
  };
}

function isVisionImage(type: string) {
  return type === "image/jpeg" || type === "image/png" || type === "image/webp";
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
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
