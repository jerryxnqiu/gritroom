import type { ExamGoal } from "./family.ts";
import { createId } from "./ids.ts";
import { nowIso } from "./time.ts";

const parentAccess = `EXISTS (
  SELECT 1 FROM guardian_grants g WHERE g.family_id = p.family_id AND g.user_id = ?
    AND g.revoked_at IS NULL
    AND (g.profile_id = p.id OR (g.profile_id IS NULL AND g.role IN ('owner', 'admin')))
)`;

export const CODEX_D1_NAME = "gritroom-db";
export const CODEX_D1_ID = "bd30feba-b7bc-456a-9a71-600c1941d608";
export const CODEX_R2_BUCKET = "gritroom";

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

export type CodexAnalysisInput = {
  summaryEn: string;
  parentZh: string;
  trainingDirections: string[];
  evidenceLimits: string;
  sourceExcerpt?: string;
};

type MaterialRow = {
  id: string;
  kind: string;
  title: string;
  url: string | null;
  notes: string | null;
  fileKey: string | null;
  fileName: string | null;
  fileType: string | null;
  examGoal: ExamGoal;
  nickname: string;
  createdByUserId: string;
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

export async function getMaterialForCodex(
  db: D1Database,
  profileId: string,
  materialId: string,
  userId: string,
) {
  return db.prepare(
    `SELECT m.id, m.kind, m.title, m.source_url AS url, m.notes, m.file_key AS fileKey,
            m.file_name AS fileName, m.file_type AS fileType, m.exam_goal AS examGoal,
            m.created_by_user_id AS createdByUserId, p.nickname
     FROM shelf_materials m JOIN profiles p ON p.id = m.profile_id
     WHERE m.id = ? AND m.profile_id = ? AND ${parentAccess}`,
  ).bind(materialId, profileId, userId).first<MaterialRow>();
}

export async function listMaterialsForCodexBank(
  db: D1Database,
  profileId: string,
  goal: ExamGoal,
  userId: string,
) {
  const profile = await db.prepare(
    `SELECT p.nickname FROM profiles p WHERE p.id = ? AND ${parentAccess}`,
  ).bind(profileId, userId).first<{ nickname: string }>();
  if (!profile) return null;

  const { results } = await db.prepare(
    `SELECT m.id, m.kind, m.title, m.source_url AS url, m.notes, m.file_key AS fileKey,
            m.file_name AS fileName, m.file_type AS fileType, m.exam_goal AS examGoal,
            m.created_by_user_id AS createdByUserId
     FROM shelf_materials m JOIN profiles p ON p.id = m.profile_id
     WHERE m.profile_id = ? AND m.exam_goal = ? AND ${parentAccess}
     ORDER BY m.kind, m.created_at DESC, m.id DESC`,
  ).bind(profileId, goal, userId).all<Omit<MaterialRow, "nickname">>();

  return { nickname: profile.nickname, materials: results };
}

/**
 * One Codex task for the whole archive: coaching reports + misc practice sources → refresh practice_questions.
 */
export function buildCodexBankBrief(input: {
  profileId: string;
  goal: ExamGoal;
  nickname: string;
  actorUserId: string;
  materials: Omit<MaterialRow, "nickname" | "examGoal" | "createdByUserId">[];
}) {
  const { profileId, goal, nickname, actorUserId, materials } = input;
  const stamp = nowIso();
  const coaching = materials.filter((item) => item.kind !== "study_material");
  const practiceSources = materials.filter((item) => item.kind === "study_material");

  const lineFor = (item: (typeof materials)[number]) => [
    `- [${item.kind}] ${item.title} (material_id=${item.id})`,
    item.fileKey ? `  r2_key=${item.fileKey} file=${item.fileName || item.id}` : null,
    item.url ? `  url=${item.url}` : null,
    item.notes?.trim() ? `  notes=${item.notes.trim().slice(0, 240)}` : null,
  ].filter(Boolean).join("\n");

  return [
    "GritRoom Codex practice-bank generation",
    "",
    "You are working in the local gritroom repo with wrangler access to remote D1/R2.",
    "Use ALL shelf inputs below (coaching reports/videos + miscellaneous practice-question sources)",
    "plus official thinking blueprints to refresh the active practice question bank.",
    "Write original Selective/OC Thinking Skills items. Do NOT copy commercial or NSW sample stems.",
    "Follow each blueprint authoring_rule and verification_rule. Respect evidence limits from coaching notes.",
    "",
    "## Scope",
    `- profile_id: ${profileId}`,
    `- learner: ${nickname}`,
    `- exam_goal: ${goal}`,
    `- actor_user_id: ${actorUserId}`,
    `- prepared_at: ${stamp}`,
    "",
    "## Where to read",
    `- D1: ${CODEX_D1_NAME} (${CODEX_D1_ID}) via wrangler.d1.jsonc`,
    `- R2 bucket: ${CODEX_R2_BUCKET}`,
    "",
    "Official foundations:",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "SELECT id, version, skill, title, method, authoring_rule, verification_rule FROM thinking_blueprints;"`,
    "```",
    "",
    "Current active bank (do not delete old versions; insert new versions instead):",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "SELECT id, version, blueprint_id, substr(prompt,1,80) AS prompt, correct_option, image_key, status FROM practice_questions WHERE status = 'active' ORDER BY blueprint_id, id, version;"`,
    "```",
    "",
    "Succeeded material analyses already on file:",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "SELECT material_id, summary_en, training_directions_json, evidence_limits FROM material_analyses WHERE profile_id = '${profileId}' AND exam_goal = '${goal}' AND status = 'succeeded' ORDER BY created_at DESC;"`,
    "```",
    "",
    "Evolved learning evidence (analyses, attempts, parent feedback):",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "SELECT kind, summary, created_at FROM learning_evidence WHERE profile_id = '${profileId}' AND exam_goal = '${goal}' ORDER BY created_at DESC LIMIT 200;"`,
    "```",
    "",
    "Recent practice attempts (what the learner got right/wrong):",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "SELECT question_id, question_version, blueprint_id, is_correct, confidence, substr(question_prompt,1,80) AS prompt, substr(draft_notes,1,120) AS notes FROM practice_attempts WHERE profile_id = '${profileId}' AND exam_goal = '${goal}' AND finalized_at IS NOT NULL ORDER BY finalized_at DESC LIMIT 200;"`,
    "```",
    "",
    "Active parent feedback:",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "SELECT body, created_at FROM shelf_feedback WHERE profile_id = '${profileId}' AND exam_goal = '${goal}' AND withdrawn_at IS NULL ORDER BY created_at DESC;"`,
    "```",
    "",
    `## Coaching reports & videos (${coaching.length})`,
    coaching.length ? coaching.map(lineFor).join("\n") : "(none in this archive)",
    "",
    `## Practice questions from miscellaneous sources (${practiceSources.length})`,
    "These are style exemplars / workbook pages — use them for difficulty, method and layout cues.",
    practiceSources.length ? practiceSources.map(lineFor).join("\n") : "(none in this archive)",
    "",
    "Download each R2 file you need, e.g.:",
    "```sh",
    `npx wrangler r2 object get ${CODEX_R2_BUCKET}/R2_KEY --file /tmp/source.bin --remote`,
    "```",
    "",
    "## What to write",
    "Weight new items toward weak spots and training directions from the evolved evidence above,",
    "while keeping official blueprint coverage. Prefer fresh stems over near-copies of active bank items.",
    "For each blueprint that should stay covered for this exam goal, insert a new active practice_questions row",
    "(same id, version = previous max + 1, or a new id if adding coverage). Text-only is fine when no figure is needed.",
    "Every new question MUST include explanation_en: a short kid-facing review (why the correct option works,",
    "and why common traps fail). Codex writes these reviews — there is no in-app learner chat.",
    "If a figure is required, upload an immutable object under",
    "`question-bank/{questionId}/v{version}/figure.webp` in R2 and set image_key / image_name / image_type.",
    "Retire superseded versions with status = 'retired' only after the new active version is inserted.",
    "",
    "Example insert shape:",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "INSERT INTO practice_questions (id, version, blueprint_id, blueprint_version, prompt, options_json, correct_option, explanation_en, status, created_at) VALUES ('q-example', 2, 'necessary-vs-sufficient', 1, 'PROMPT', '{\\"A\\":\\"\\",\\"B\\":\\"\\",\\"C\\":\\"\\",\\"D\\":\\"\\"}', 'B', 'WHY_B_IS_RIGHT', 'active', '${stamp}');"`,
    "```",
    "",
    "Confirm coverage:",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "SELECT blueprint_id, id, version, substr(prompt,1,80) AS prompt, substr(explanation_en,1,80) AS explanation FROM practice_questions WHERE status = 'active' ORDER BY blueprint_id, id;"`,
    "```",
    "",
    "Then tell the parent to refresh Parent room → Practice bank / start a new practice session.",
  ].join("\n");
}

/**
 * Codex task: write personalised kid-facing reviews for incorrect attempts that still lack attempt_review_en.
 */
export function buildCodexAttemptReviewBrief(input: {
  profileId: string;
  goal: ExamGoal;
  nickname: string;
  actorUserId: string;
  pendingCount: number;
}) {
  const { profileId, goal, nickname, actorUserId, pendingCount } = input;
  const stamp = nowIso();

  return [
    "GritRoom Codex incorrect-attempt reviews",
    "",
    "You are working in the local gritroom repo with wrangler access to remote D1.",
    "Write short kid-facing reviews for incorrect practice attempts that still have attempt_review_en IS NULL.",
    "These offline reviews are Codex’s job — learners practise without an in-app chat bot.",
    "Do not invent exam rules. Use the attempt snapshot + matching thinking_blueprints verification_rule.",
    "",
    "## Scope",
    `- profile_id: ${profileId}`,
    `- learner: ${nickname}`,
    `- exam_goal: ${goal}`,
    `- actor_user_id: ${actorUserId}`,
    `- pending_incorrect_without_review: ${pendingCount}`,
    `- prepared_at: ${stamp}`,
    "",
    "## Where to read",
    `- D1: ${CODEX_D1_NAME} (${CODEX_D1_ID}) via wrangler.d1.jsonc`,
    "",
    "Incorrect attempts still needing a review (up to 200):",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "SELECT id, question_id, question_version, blueprint_id, selected_option, correct_option, confidence, substr(question_prompt,1,120) AS prompt, substr(draft_notes,1,160) AS notes, substr(explanation_en,1,160) AS bank_explanation FROM practice_attempts WHERE profile_id = '${profileId}' AND exam_goal = '${goal}' AND finalized_at IS NOT NULL AND is_correct = 0 AND attempt_review_en IS NULL ORDER BY finalized_at DESC LIMIT 200;"`,
    "```",
    "",
    "Blueprint checks for those items:",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "SELECT id, version, title, method, verification_rule FROM thinking_blueprints;"`,
    "```",
    "",
    "## What to write",
    "For each listed attempt, UPDATE practice_attempts.attempt_review_en with 2–4 short sentences for the child:",
    "- name the option they chose and why it fails",
    "- name the correct option and the key reason it works",
    "- one next-time tip tied to the blueprint method",
    "Keep English, kind, concrete. Max 4000 characters. Do not overwrite explanation_en.",
    "Optionally INSERT learning_evidence kind='review' with ref_id=attempt id and a one-line summary.",
    "",
    "Example update:",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "UPDATE practice_attempts SET attempt_review_en = 'You chose D because … The correct answer is A because … Next time …' WHERE id = 'pat_EXAMPLE' AND profile_id = '${profileId}' AND is_correct = 0 AND attempt_review_en IS NULL;"`,
    "```",
    "",
    "Confirm remaining gaps:",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "SELECT COUNT(*) AS still_open FROM practice_attempts WHERE profile_id = '${profileId}' AND exam_goal = '${goal}' AND is_correct = 0 AND finalized_at IS NOT NULL AND attempt_review_en IS NULL;"`,
    "```",
    "",
    "Then tell the parent to refresh Parent room / have the learner reopen practice evidence.",
  ].join("\n");
}

/**
 * Agent task for Codex: read this material from remote D1/R2 and write findings back to D1.
 * Parents click one shelf button to copy this into a Codex chat in the gritroom repo.
 */
export function buildCodexMaterialBrief(
  material: MaterialRow,
  profileId: string,
  actorUserId: string,
) {
  const analysisId = createId("anl");
  const evidenceId = createId("evd");
  const stamp = nowIso();

  return [
    "GritRoom Codex material analysis",
    "",
    "You are working in the local gritroom repo. Analyse this shelf material yourself.",
    "Read from remote D1 / R2 with wrangler. Write findings straight back to remote D1.",
    "Do not invent exam questions unsupported by the source. Separate facts from assumptions.",
    "",
    "## Scope",
    `- profile_id: ${profileId}`,
    `- learner: ${material.nickname}`,
    `- exam_goal: ${material.examGoal}`,
    `- material_id: ${material.id}`,
    `- kind: ${material.kind}`,
    `- title: ${material.title}`,
    material.url ? `- source_url: ${material.url}` : "- source_url: (none)",
    material.notes?.trim() ? `- notes: ${material.notes.trim()}` : "- notes: (none)",
    material.fileName ? `- file_name: ${material.fileName}` : "- file_name: (none)",
    material.fileType ? `- file_type: ${material.fileType}` : "- file_type: (none)",
    material.fileKey ? `- r2_key: ${material.fileKey}` : "- r2_key: (none — text/link only)",
    `- created_by_user_id: ${material.createdByUserId}`,
    `- actor_user_id (save as created_by): ${actorUserId}`,
    "",
    "## Where to read",
    `- D1 database name: ${CODEX_D1_NAME}`,
    `- D1 database id: ${CODEX_D1_ID}`,
    `- wrangler D1 config: wrangler.d1.jsonc`,
    `- R2 bucket: ${CODEX_R2_BUCKET}`,
    "",
    "Read the material row:",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "SELECT id, profile_id, exam_goal, kind, title, source_url, notes, file_key, file_name, file_type, created_by_user_id FROM shelf_materials WHERE id = '${material.id}' AND profile_id = '${profileId}';"`,
    "```",
    material.fileKey
      ? [
          "",
          "Download the private file from R2 (save under /tmp for reading):",
          "```sh",
          `npx wrangler r2 object get ${CODEX_R2_BUCKET}/${material.fileKey} --file /tmp/${material.fileName || material.id} --remote`,
          "```",
        ].join("\n")
      : "",
    "",
    "## What to produce",
    "- summary_en: English practice signals from the source",
    "- parent_zh: optional Chinese parent reading, or empty",
    "- training_directions: up to 5 concrete next practice directions (JSON array string)",
    "- evidence_limits: what this source does NOT prove",
    "- source_excerpt: short excerpt/notes used (max 8000 chars)",
    "",
    "## Where to save (remote D1)",
    "Insert one succeeded analysis and one learning_evidence row. Use these ids/timestamps unless collisions force new ones:",
    `- analysis id: ${analysisId}`,
    `- evidence id: ${evidenceId}`,
    `- completed_at / created_at: ${stamp}`,
    `- model: codex`,
    "",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "INSERT INTO material_analyses (id, material_id, profile_id, exam_goal, status, summary_en, parent_zh, training_directions_json, evidence_limits, source_excerpt, model, created_by_user_id, created_at, completed_at) VALUES ('${analysisId}', '${material.id}', '${profileId}', '${material.examGoal}', 'succeeded', 'SUMMARY_EN', NULL, '[\\"DIRECTION\\"]', 'LIMITS', 'EXCERPT', 'codex', '${actorUserId}', '${stamp}', '${stamp}'); INSERT INTO learning_evidence (id, profile_id, exam_goal, kind, ref_id, summary, created_at) VALUES ('${evidenceId}', '${profileId}', '${material.examGoal}', 'material_analysis', '${analysisId}', 'SUMMARY_EN', '${stamp}');"`,
    "```",
    "",
    "Replace SUMMARY_EN / DIRECTION / LIMITS / EXCERPT (and parent_zh NULL if unused) with real values.",
    "Escape SQL quotes. Keep summary_en and evidence_limits non-empty.",
    "After writing, confirm with:",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "SELECT id, status, model, substr(summary_en,1,120) AS summary FROM material_analyses WHERE material_id = '${material.id}' ORDER BY created_at DESC LIMIT 1;"`,
    "```",
    "",
    "Then tell the parent to refresh Parent room → Resource shelf.",
  ].filter((line) => line !== "").join("\n");
}

export function parseCodexAnalysisInput(value: unknown): CodexAnalysisInput | { error: string } {
  if (!value || typeof value !== "object") return { error: "Send Codex findings as JSON." };
  const body = value as Record<string, unknown>;

  let source: Record<string, unknown> = body;
  if (typeof body.json === "string" && body.json.trim()) {
    try {
      const parsed = JSON.parse(body.json) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { error: "Codex output must be one JSON object." };
      }
      source = parsed as Record<string, unknown>;
    } catch {
      return { error: "Codex output is not valid JSON." };
    }
  }

  const summaryEn = cleanText(source.summary_en ?? source.summaryEn, 4000);
  const parentZh = cleanText(source.parent_zh ?? source.parentZh, 2000);
  const evidenceLimits = cleanText(source.evidence_limits ?? source.evidenceLimits, 2000);
  const rawDirections = source.training_directions ?? source.trainingDirections;
  const trainingDirections = Array.isArray(rawDirections)
    ? rawDirections.map((item) => cleanText(item, 240)).filter(Boolean).slice(0, 5)
    : [];
  const sourceExcerpt = cleanText(source.source_excerpt ?? source.sourceExcerpt, 8000);

  if (!summaryEn) return { error: "summary_en is required." };
  if (!evidenceLimits) return { error: "evidence_limits is required." };

  return {
    summaryEn,
    parentZh,
    trainingDirections,
    evidenceLimits,
    sourceExcerpt: sourceExcerpt || undefined,
  };
}

/** Optional HTTP write-back if an agent prefers the API over wrangler SQL. */
export async function saveCodexMaterialAnalysis(
  db: D1Database,
  profileId: string,
  materialId: string,
  userId: string,
  input: CodexAnalysisInput,
) {
  const material = await getMaterialForCodex(db, profileId, materialId, userId);
  if (!material) return { ok: false as const, status: 404 as const, error: "This resource is unavailable." };

  const analysisId = createId("anl");
  const evidenceId = createId("evd");
  const stamp = nowIso();
  const excerpt = (input.sourceExcerpt
    || material.notes?.trim()
    || `Codex review of ${material.title}`).slice(0, 8000);

  try {
    await db.batch([
      db.prepare(
        `INSERT INTO material_analyses
           (id, material_id, profile_id, exam_goal, status, summary_en, parent_zh,
            training_directions_json, evidence_limits, source_excerpt, model,
            created_by_user_id, created_at, completed_at)
         VALUES (?, ?, ?, ?, 'succeeded', ?, ?, ?, ?, ?, 'codex', ?, ?, ?)`,
      ).bind(
        analysisId,
        materialId,
        profileId,
        material.examGoal,
        input.summaryEn,
        input.parentZh || null,
        JSON.stringify(input.trainingDirections),
        input.evidenceLimits,
        excerpt,
        userId,
        stamp,
        stamp,
      ),
      db.prepare(
        `INSERT INTO learning_evidence (id, profile_id, exam_goal, kind, ref_id, summary, created_at)
         VALUES (?, ?, ?, 'material_analysis', ?, ?, ?)`,
      ).bind(evidenceId, profileId, material.examGoal, analysisId, input.summaryEn, stamp),
    ]);
  } catch {
    return { ok: false as const, status: 503 as const, error: "Could not save Codex findings. Try again." };
  }

  return {
    ok: true as const,
    analysis: {
      id: analysisId,
      materialId,
      status: "succeeded" as const,
      summaryEn: input.summaryEn,
      parentZh: input.parentZh || null,
      trainingDirections: input.trainingDirections,
      evidenceLimits: input.evidenceLimits,
      error: null,
      createdAt: stamp,
      completedAt: stamp,
    } satisfies MaterialAnalysis,
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
