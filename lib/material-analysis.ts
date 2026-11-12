import type { ExamGoal } from "./family.ts";
import { createId } from "./ids.ts";
import type { PracticeSubject } from "./subjects.ts";
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

export type MaterialAnalysisEvidence = MaterialAnalysis & {
  materialTitle: string;
  materialKind: string;
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
  subject: PracticeSubject;
  nickname: string;
  createdByUserId: string;
};

export async function listMaterialAnalyses(
  db: D1Database,
  profileId: string,
  goal: ExamGoal,
  userId: string,
  subject: PracticeSubject = "thinking",
) {
  const rows = await db.prepare(
    `SELECT a.id, a.material_id AS materialId, a.status, a.summary_en AS summaryEn, a.parent_zh AS parentZh,
            a.training_directions_json AS trainingJson, a.evidence_limits AS evidenceLimits,
            a.error, a.created_at AS createdAt, a.completed_at AS completedAt
     FROM material_analyses a
     JOIN profiles p ON p.id = a.profile_id
     WHERE a.profile_id = ? AND a.exam_goal = ? AND a.subject = ? AND ${parentAccess}
       AND a.id = (
         SELECT a2.id FROM material_analyses a2
         WHERE a2.material_id = a.material_id
         ORDER BY a2.created_at DESC, a2.id DESC LIMIT 1
       )
     ORDER BY a.created_at DESC`,
  ).bind(profileId, goal, subject, userId).all<{
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

/** Latest succeeded Codex findings with shelf titles — used by Reading evidence before practice attempts exist. */
export async function listSucceededMaterialEvidence(
  db: D1Database,
  profileId: string,
  goal: ExamGoal,
  userId: string,
  subject: PracticeSubject = "thinking",
) {
  const rows = await db.prepare(
    `SELECT a.id, a.material_id AS materialId, a.status, a.summary_en AS summaryEn, a.parent_zh AS parentZh,
            a.training_directions_json AS trainingJson, a.evidence_limits AS evidenceLimits,
            a.error, a.created_at AS createdAt, a.completed_at AS completedAt,
            m.title AS materialTitle, m.kind AS materialKind
     FROM material_analyses a
     JOIN shelf_materials m ON m.id = a.material_id
     JOIN profiles p ON p.id = a.profile_id
     WHERE a.profile_id = ? AND a.exam_goal = ? AND a.subject = ? AND a.status = 'succeeded'
       AND ${parentAccess}
       AND a.id = (
         SELECT a2.id FROM material_analyses a2
         WHERE a2.material_id = a.material_id AND a2.status = 'succeeded'
         ORDER BY a2.created_at DESC, a2.id DESC LIMIT 1
       )
     ORDER BY a.created_at DESC, a.id DESC`,
  ).bind(profileId, goal, subject, userId).all<{
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
    materialTitle: string;
    materialKind: string;
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
    materialTitle: row.materialTitle,
    materialKind: row.materialKind,
  })) satisfies MaterialAnalysisEvidence[];
}

/** Kid-facing coach tips for the learner room (English summary + practice directions only). */
export type LearnerCoachTip = {
  id: string;
  materialKind: string;
  summaryEn: string;
  trainingDirections: string[];
  createdAt: string;
  completedAt: string | null;
};

export async function listLearnerCoachTips(
  db: D1Database,
  userId: string,
  subject: PracticeSubject = "thinking",
) {
  const rows = await db.prepare(
    `SELECT a.id, a.summary_en AS summaryEn, a.training_directions_json AS trainingJson,
            a.created_at AS createdAt, a.completed_at AS completedAt, m.kind AS materialKind
     FROM material_analyses a
     JOIN shelf_materials m ON m.id = a.material_id
     JOIN learner_links l ON l.profile_id = a.profile_id AND l.user_id = ?
     JOIN profiles p ON p.id = a.profile_id
     WHERE a.exam_goal = p.exam_goal AND a.subject = ? AND a.status = 'succeeded'
       AND a.summary_en IS NOT NULL AND length(trim(a.summary_en)) > 0
       AND a.id = (
         SELECT a2.id FROM material_analyses a2
         WHERE a2.material_id = a.material_id AND a2.status = 'succeeded'
         ORDER BY a2.created_at DESC, a2.id DESC LIMIT 1
       )
     ORDER BY a.created_at DESC, a.id DESC`,
  ).bind(userId, subject).all<{
    id: string;
    summaryEn: string;
    trainingJson: string | null;
    createdAt: string;
    completedAt: string | null;
    materialKind: string;
  }>();

  return rows.results.map((row): LearnerCoachTip => ({
    id: row.id,
    materialKind: row.materialKind,
    summaryEn: row.summaryEn,
    trainingDirections: parseDirections(row.trainingJson),
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  }));
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
            m.subject, m.created_by_user_id AS createdByUserId, p.nickname
     FROM shelf_materials m JOIN profiles p ON p.id = m.profile_id
     WHERE m.id = ? AND m.profile_id = ? AND ${parentAccess}`,
  ).bind(materialId, profileId, userId).first<MaterialRow>();
}

export async function listMaterialsForCodexBank(
  db: D1Database,
  profileId: string,
  goal: ExamGoal,
  userId: string,
  subject: PracticeSubject = "thinking",
) {
  const profile = await db.prepare(
    `SELECT p.nickname FROM profiles p WHERE p.id = ? AND ${parentAccess}`,
  ).bind(profileId, userId).first<{ nickname: string }>();
  if (!profile) return null;

  const { results } = await db.prepare(
    `SELECT m.id, m.kind, m.title, m.source_url AS url, m.notes, m.file_key AS fileKey,
            m.file_name AS fileName, m.file_type AS fileType, m.exam_goal AS examGoal,
            m.subject, m.created_by_user_id AS createdByUserId
     FROM shelf_materials m JOIN profiles p ON p.id = m.profile_id
     WHERE m.profile_id = ? AND m.exam_goal = ? AND m.subject = ? AND ${parentAccess}
     ORDER BY m.kind, m.created_at DESC, m.id DESC`,
  ).bind(profileId, goal, subject, userId).all<Omit<MaterialRow, "nickname">>();

  return { nickname: profile.nickname, materials: results };
}

type BankMaterial = Omit<MaterialRow, "nickname" | "examGoal" | "createdByUserId" | "subject"> & {
  subject?: PracticeSubject;
};

function materialLines(materials: BankMaterial[]) {
  return materials.map((item) => [
    `- [${item.kind}] ${item.title} (material_id=${item.id})`,
    item.fileKey ? `  r2_key=${item.fileKey} file=${item.fileName || item.id}` : null,
    item.url ? `  url=${item.url}` : null,
    item.notes?.trim() ? `  notes=${item.notes.trim().slice(0, 240)}` : null,
  ].filter(Boolean).join("\n")).join("\n");
}

export type ReadingCodexTask = "bank" | "remediation";

/**
 * One Codex task for the whole archive module: coaching + misc sources → refresh bank / reading prep.
 */
export function buildCodexBankBrief(input: {
  profileId: string;
  goal: ExamGoal;
  nickname: string;
  actorUserId: string;
  materials: BankMaterial[];
  subject?: PracticeSubject;
  readingTask?: ReadingCodexTask;
}) {
  const subject = input.subject ?? "thinking";
  if (subject === "reading") {
    return input.readingTask === "remediation"
      ? buildCodexReadingRemediationBrief(input)
      : buildCodexReadingBankBrief(input);
  }

  const { profileId, goal, nickname, actorUserId, materials } = input;
  const stamp = nowIso();
  const coaching = materials.filter((item) => item.kind !== "study_material");
  const practiceSources = materials.filter((item) => item.kind === "study_material");

  return [
    "GritRoom Codex practice-bank generation",
    "",
    "You are working in the local gritroom repo with wrangler access to remote D1/R2.",
    "Use ALL shelf inputs below (coaching reports/videos + miscellaneous practice-question sources)",
    "plus official thinking blueprints to refresh the active Thinking Skills practice question bank.",
    "Write original Selective/OC Thinking Skills items. Do NOT copy commercial or NSW sample stems.",
    "Follow each blueprint authoring_rule and verification_rule. Respect evidence limits from coaching notes.",
    "Imitate the uploaded miscellaneous practice sources for length, density and wording quality — real papers are",
    "comprehensive, not one-line riddles. Prefer visual stems: aim for at least half of new items to use a figure,",
    "table, chart, diagram or spatial layout (upload to R2) when the blueprint can support it.",
    "",
    "## Scope",
    `- profile_id: ${profileId}`,
    `- learner: ${nickname}`,
    `- exam_goal: ${goal}`,
    `- subject: thinking`,
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
    "Current active Thinking Skills bank (do not delete old versions; insert new versions instead):",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "SELECT id, version, blueprint_id, substr(prompt,1,80) AS prompt, correct_option, image_key, status FROM practice_questions WHERE status = 'active' AND subject = 'thinking' ORDER BY blueprint_id, id, version;"`,
    "```",
    "",
    "Succeeded material analyses already on file:",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "SELECT material_id, summary_en, training_directions_json, evidence_limits FROM material_analyses WHERE profile_id = '${profileId}' AND exam_goal = '${goal}' AND subject = 'thinking' AND status = 'succeeded' ORDER BY created_at DESC;"`,
    "```",
    "",
    "Evolved learning evidence (analyses, attempts, parent feedback):",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "SELECT kind, summary, created_at FROM learning_evidence WHERE profile_id = '${profileId}' AND exam_goal = '${goal}' AND subject = 'thinking' ORDER BY created_at DESC LIMIT 200;"`,
    "```",
    "",
    "Recent practice attempts (what the learner got right/wrong):",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "SELECT question_id, question_version, blueprint_id, is_correct, confidence, substr(question_prompt,1,80) AS prompt, substr(draft_notes,1,120) AS notes FROM practice_attempts WHERE profile_id = '${profileId}' AND exam_goal = '${goal}' AND subject = 'thinking' AND finalized_at IS NOT NULL ORDER BY finalized_at DESC LIMIT 200;"`,
    "```",
    "",
    "Weak-spot blueprints for this learner (incorrect finalized attempts, highest miss count first):",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "SELECT blueprint_id, COUNT(*) AS misses FROM practice_attempts WHERE profile_id = '${profileId}' AND exam_goal = '${goal}' AND subject = 'thinking' AND finalized_at IS NOT NULL AND is_correct = 0 AND blueprint_id IS NOT NULL GROUP BY blueprint_id ORDER BY misses DESC, blueprint_id LIMIT 8;"`,
    "```",
    "",
    "Active parent feedback:",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "SELECT body, created_at FROM shelf_feedback WHERE profile_id = '${profileId}' AND exam_goal = '${goal}' AND subject = 'thinking' AND withdrawn_at IS NULL ORDER BY created_at DESC;"`,
    "```",
    "",
    `## Coaching reports & videos (${coaching.length})`,
    coaching.length ? materialLines(coaching) : "(none in this archive)",
    "",
    `## Practice questions from miscellaneous sources (${practiceSources.length})`,
    "CRITICAL style models — download and study these pages before authoring.",
    "Match their comprehensive wording, multi-step stems, option craft, and visual density.",
    "In real Selective/OC Thinking Skills, graph / table / diagram / spatial items are a large share (target ≥ 50%).",
    "Use these sources for difficulty, method and layout cues only. Invent new scenarios; never reproduce protected text or figures.",
    practiceSources.length ? materialLines(practiceSources) : "(none in this archive — still prefer visual stems where blueprints allow)",
    "",
    "Download each R2 file you need, e.g.:",
    "```sh",
    `npx wrangler r2 object get ${CODEX_R2_BUCKET}/R2_KEY --file /tmp/source.bin --remote`,
    "```",
    "",
    "## What to write",
    "This refresh should ADD about 60 new active Thinking Skills questions (subject = 'thinking').",
    goal === "selective"
      ? "Selective mix for the ~60 new items: about 25–30 on the learner’s weak-spot blueprints (from the miss counts above),"
        + " and the remaining ~30–35 spread across other blueprints so a full 40-question timed paper and mixed Practice · 10 sets stay balanced."
      : "OC mix for the ~60 new items: about 25–30 on the learner’s weak-spot blueprints (from the miss counts above),"
        + " and the remaining ~30–35 spread across other blueprints so a full 30-question timed paper and mixed Practice · 10 sets stay balanced.",
    "If there are no weak-spot misses yet, spread all ~60 evenly across blueprints.",
    "Also honour training directions from material analyses and parent feedback when choosing which weak blueprints to reinforce.",
    "Several original items per blueprint is expected; one-per-blueprint is not enough.",
    "Prefer fresh stems over near-copies of active bank items. Keep official blueprint coverage so the bank is not only remediation.",
    "Insert new active practice_questions rows with subject = 'thinking'",
    "(same id with version = previous max + 1, or new ids for added coverage).",
    "Write full, exam-like stems (context + data + question), not short toy prompts.",
    "Across the refresh batch, at least half of new active items should include a figure or table image in R2",
    "(graphs, tables, diagrams, maps, nets, rotations, count grids, etc.) when the skill can use one.",
    "Text-only is OK only when a visual would not help that blueprint.",
    "Every new question MUST include explanation_en: a short kid-facing review (why the correct option works,",
    "and why common traps fail). Codex writes these reviews — there is no in-app learner chat.",
    "For visual items, upload an immutable object under",
    "`question-bank/{questionId}/v{version}/figure.webp` in R2 and set image_key / image_name / image_type.",
    "Retire superseded versions with status = 'retired' only after the new active version is inserted.",
    "",
    "Example insert shape:",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "INSERT INTO practice_questions (id, version, blueprint_id, blueprint_version, prompt, options_json, correct_option, explanation_en, status, subject, created_at) VALUES ('q-example', 2, 'necessary-vs-sufficient', 1, 'PROMPT', '{\\"A\\":\\"\\",\\"B\\":\\"\\",\\"C\\":\\"\\",\\"D\\":\\"\\"}', 'B', 'WHY_B_IS_RIGHT', 'active', 'thinking', '${stamp}');"`,
    "```",
    "",
    "Confirm coverage:",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "SELECT blueprint_id, id, version, substr(prompt,1,80) AS prompt, substr(explanation_en,1,80) AS explanation FROM practice_questions WHERE status = 'active' AND subject = 'thinking' ORDER BY blueprint_id, id;"`,
    "```",
    "",
    "Then tell the parent to refresh Parent room → Thinking Skills → Practice bank / start a new practice session.",
  ].join("\n");
}

/** Reading practice generation: mimic uploaded + official samples; save style packs + original drafts. */
function buildCodexReadingBankBrief(input: {
  profileId: string;
  goal: ExamGoal;
  nickname: string;
  actorUserId: string;
  materials: BankMaterial[];
}) {
  const { profileId, goal, nickname, actorUserId, materials } = input;
  const stamp = nowIso();
  const coaching = materials.filter((item) => item.kind !== "study_material");
  const practiceSources = materials.filter((item) => item.kind === "study_material");
  const evidenceId = createId("evd");
  const packId = createId("rdp");

  return [
    "GritRoom Codex Reading practice generation",
    "",
    "You are working in the local gritroom repo with wrangler access to remote D1/R2.",
    `Build original ${goal === "oc" ? "OC" : "Selective"} Reading practice for ${nickname}.`,
    "Mimic the family’s uploaded practice papers AND the official NSW Reading sample papers as closely as possible",
    "in length, genre mix, question craft, distractor style and difficulty — but invent NEW passages and NEW stems.",
    "Never copy or lightly paraphrase protected commercial/NSW text or figures.",
    "Passage authenticity: prefer genuine-feeling writing, not toy or cartoonish made-up worlds.",
    "- Non-fiction (reports, magazine-style, nature/science/history): ground claims in ordinary public knowledge;",
    "  write fresh wording; do not invent impossible facts or gimmick topics.",
    "- Fiction / poetry when the style models need them: keep them age-appropriate and exam-like",
    "  (plausible settings, natural voice) — avoid slapstick, meme humour, or fantasy fluff that real papers rarely use.",
    "Do NOT insert Thinking Skills practice_questions rows.",
    "",
    "## Scope",
    `- profile_id: ${profileId}`,
    `- learner: ${nickname}`,
    `- exam_goal: ${goal}`,
    `- subject: reading`,
    `- actor_user_id: ${actorUserId}`,
    `- prepared_at: ${stamp}`,
    "",
    "## Where to read",
    `- D1: ${CODEX_D1_NAME} (${CODEX_D1_ID}) via wrangler.d1.jsonc`,
    `- R2 bucket: ${CODEX_R2_BUCKET}`,
    "",
    "Official Reading format + blueprints (structure target):",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "SELECT id, exam_goal, kind, label, url, question_count, answer_count, minutes, option_count, substr(notes,1,200) AS notes FROM reading_sources WHERE exam_goal = '${goal}';"`,
    "```",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "SELECT id, version, skill, title, method, authoring_rule, verification_rule FROM reading_blueprints;"`,
    "```",
    "",
    "Download and study the official worked-example PDFs listed in reading_sources (kind = worked_examples).",
    "Also open the official format guide URL. Capture: passage length, genre mix, multi-part question patterns,",
    "option wording, and how inference vs literal detail is tested — then invent originals that feel the same.",
    "",
    "Existing Reading analyses / evidence / bank:",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "SELECT material_id, substr(summary_en,1,160) AS summary, training_directions_json, substr(evidence_limits,1,160) AS limits FROM material_analyses WHERE profile_id = '${profileId}' AND exam_goal = '${goal}' AND subject = 'reading' AND status = 'succeeded' ORDER BY created_at DESC LIMIT 50;"`,
    "```",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "SELECT kind, substr(summary,1,200) AS summary, created_at FROM learning_evidence WHERE profile_id = '${profileId}' AND exam_goal = '${goal}' AND subject = 'reading' ORDER BY created_at DESC LIMIT 100;"`,
    "```",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "SELECT id, version, blueprint_id, passage_group, passage_title, substr(prompt,1,100) AS prompt, correct_option FROM reading_questions WHERE exam_goal = '${goal}' AND status = 'active' ORDER BY passage_group, id;"`,
    "```",
    "",
    "Recent Reading practice attempts (what the learner got right/wrong):",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "SELECT a.question_id, a.question_version, q.blueprint_id, a.is_correct, a.confidence, substr(a.question_prompt,1,100) AS prompt, substr(a.draft_notes,1,120) AS notes FROM practice_attempts a LEFT JOIN reading_questions q ON q.id = a.question_id AND q.version = a.question_version WHERE a.profile_id = '${profileId}' AND a.exam_goal = '${goal}' AND a.subject = 'reading' AND a.finalized_at IS NOT NULL ORDER BY a.finalized_at DESC LIMIT 200;"`,
    "```",
    "",
    "Weak-spot Reading skills for this learner (incorrect finalized attempts, highest miss count first).",
    "Join via reading_questions.blueprint_id — practice_attempts.blueprint_id stays null for Reading (FK is Thinking-only):",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "SELECT q.blueprint_id, b.skill, b.title, COUNT(*) AS misses FROM practice_attempts a JOIN reading_questions q ON q.id = a.question_id AND q.version = a.question_version LEFT JOIN reading_blueprints b ON b.id = q.blueprint_id WHERE a.profile_id = '${profileId}' AND a.exam_goal = '${goal}' AND a.subject = 'reading' AND a.finalized_at IS NOT NULL AND a.is_correct = 0 AND q.blueprint_id IS NOT NULL GROUP BY q.blueprint_id, b.skill, b.title ORDER BY misses DESC, q.blueprint_id LIMIT 8;"`,
    "```",
    "",
    "Active Reading parent feedback:",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "SELECT body, created_at FROM shelf_feedback WHERE profile_id = '${profileId}' AND exam_goal = '${goal}' AND subject = 'reading' AND withdrawn_at IS NULL ORDER BY created_at DESC;"`,
    "```",
    "",
    `## Coaching reports & videos (${coaching.length})`,
    coaching.length ? materialLines(coaching) : "(none)",
    "",
    `## Uploaded Reading practice sources (${practiceSources.length}) — PRIMARY STYLE MODELS`,
    "Group rows with the same `Passage set: …` notes line. Download every page in each set, read in order,",
    "and treat each set as one article (+ its sample questions). Match their:",
    "- passage density and age-appropriate vocabulary",
    "- question types (detail, inference, vocab-in-context, purpose, compare, structure)",
    "- distractor craft (near-misses that feel plausible)",
    "- how many questions sit with one article",
    "Use them only as models. Invent new scenarios; never reproduce protected text.",
    practiceSources.length ? materialLines(practiceSources) : "(none — lean harder on official samples + blueprints)",
    "",
    "Download R2 files, e.g.:",
    "```sh",
    `npx wrangler r2 object get ${CODEX_R2_BUCKET}/R2_KEY --file /tmp/source.bin --remote`,
    "```",
    "",
    "## What to produce",
    "1) Style capture: for each Passage set / useful coaching source, upsert a succeeded material_analyses row",
    "   (subject = 'reading') describing structure, skills tested, and evidence limits.",
    "2) Original Reading practice bank: invent about 2–3 short original articles for this exam goal,",
    "   each with 3–5 original multiple-choice questions that mimic the models above",
    "   (about 8–12 new stems total — enough for a short Practice / timed Reading set).",
    "   Prefer at least one solid non-fiction piece that could pass for a real junior article;",
    "   only add fiction/poetry if the uploaded or official mix clearly includes them.",
    "   Weak-spot mix (same idea as Thinking Skills): about half of the new stems should target the learner’s",
    "   weak-spot Reading blueprints / skills from the miss counts above; the rest should spread across other",
    "   reading_blueprints so mixed sets stay balanced.",
    "   If there are no Reading misses yet (or blueprint_id was missing on past bank items), spread evenly",
    "   across reading_blueprints and still honour coaching / parent-feedback training directions.",
    "   Kid-facing English explanations for every key.",
    "   Reuse the same passage_group + passage_title + passage_text for every question that belongs to one article.",
    "   ALWAYS set blueprint_id to a reading_blueprints.id that matches the skill tested — required so later",
    "   weak-spot refreshes can count misses by skill. Leave NULL only when no blueprint truly fits.",
    "   Insert each item into reading_questions (NOT practice_questions):",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "INSERT INTO reading_questions (id, version, exam_goal, blueprint_id, passage_group, passage_title, passage_text, prompt, options_json, correct_option, explanation_en, status, created_at) VALUES ('rq-example', 1, '${goal}', 'fiction-comprehension', 'pg-example', 'TITLE', 'PASSAGE_TEXT', 'STEM', '{\\"A\\":\\"\\",\\"B\\":\\"\\",\\"C\\":\\"\\",\\"D\\":\\"\\"}', 'B', 'WHY_B_IS_RIGHT', 'active', '${stamp}');"`,
    "```",
    "Prefer new ids for new stems. If you revise an existing id, insert version = previous + 1 and leave older versions retired only after the new active row exists.",
    "3) Also save a pack summary into learning_evidence so Parent room → Reading → Evidence can show it:",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "INSERT INTO learning_evidence (id, profile_id, exam_goal, subject, kind, ref_id, summary, created_at) VALUES ('${evidenceId}', '${profileId}', '${goal}', 'reading', 'reading_practice_pack', '${packId}', 'PACK_SUMMARY_JSON_OR_TEXT', '${stamp}');"`,
    "```",
    "Put in summary (≤4000 chars) a compact plain-text pack: article titles, question stems, keys, short explanations,",
    "which weak-spot skills were reinforced (if any),",
    "and which uploaded Passage set / official sample each item was modelled on (by style, not by copying).",
    "If the summary would exceed 4000 chars, split across 2–3 learning_evidence rows with the same ref_id.",
    "",
    "Confirm bank:",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "SELECT passage_group, id, version, blueprint_id, substr(passage_title,1,60) AS title, correct_option FROM reading_questions WHERE exam_goal = '${goal}' AND status = 'active' ORDER BY passage_group, id;"`,
    "```",
    "",
    "Then tell the parent to refresh Parent room → Reading → Evidence / Practice bank,",
    "and that the learner can open Learner room → Reading to practise unused items.",
  ].join("\n");
}

/**
 * Reading remediation: diagnose likely misunderstandings, vocab/phrase meanings, copywork + photo check plan.
 */
function buildCodexReadingRemediationBrief(input: {
  profileId: string;
  goal: ExamGoal;
  nickname: string;
  actorUserId: string;
  materials: BankMaterial[];
}) {
  const { profileId, goal, nickname, actorUserId, materials } = input;
  const stamp = nowIso();
  const coaching = materials.filter((item) => item.kind !== "study_material");
  const practiceSources = materials.filter((item) => item.kind === "study_material");
  const evidenceId = createId("evd");
  const planId = createId("rrd");

  return [
    "GritRoom Codex Reading remediation & language drill",
    "",
    "You are working in the local gritroom repo with wrangler access to remote D1/R2.",
    `Help ${nickname} grasp Reading mistakes — not only with new MCQs.`,
    "From coaching notes, uploaded articles/questions, parent feedback and any Reading evidence,",
    "infer WHY answers go wrong (vocabulary, phrases, sentence structure, inference leaps),",
    "list the language likely misunderstood with correct kid-facing meanings,",
    "and prescribe repeated handwriting copywork. Parents will photograph the writing for Codex to cross-check.",
    "Do NOT insert Thinking Skills practice_questions.",
    "",
    "## Scope",
    `- profile_id: ${profileId}`,
    `- learner: ${nickname}`,
    `- exam_goal: ${goal}`,
    `- subject: reading`,
    `- remediation_plan_id: ${planId}`,
    `- actor_user_id: ${actorUserId}`,
    `- prepared_at: ${stamp}`,
    "",
    "## Where to read",
    `- D1: ${CODEX_D1_NAME} (${CODEX_D1_ID}) via wrangler.d1.jsonc`,
    `- R2 bucket: ${CODEX_R2_BUCKET}`,
    "",
    "Reading blueprints (skill labels only):",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "SELECT id, skill, title, method FROM reading_blueprints;"`,
    "```",
    "",
    "Reading analyses, evidence, feedback:",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "SELECT material_id, substr(summary_en,1,200) AS summary, training_directions_json FROM material_analyses WHERE profile_id = '${profileId}' AND exam_goal = '${goal}' AND subject = 'reading' AND status = 'succeeded' ORDER BY created_at DESC LIMIT 50;"`,
    "```",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "SELECT kind, substr(summary,1,240) AS summary, created_at FROM learning_evidence WHERE profile_id = '${profileId}' AND exam_goal = '${goal}' AND subject = 'reading' ORDER BY created_at DESC LIMIT 100;"`,
    "```",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "SELECT body, created_at FROM shelf_feedback WHERE profile_id = '${profileId}' AND exam_goal = '${goal}' AND subject = 'reading' AND withdrawn_at IS NULL ORDER BY created_at DESC;"`,
    "```",
    "",
    "If any Reading practice attempts exist later, also check:",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "SELECT id, selected_option, correct_option, substr(question_prompt,1,120) AS prompt, substr(draft_notes,1,120) AS notes FROM practice_attempts WHERE profile_id = '${profileId}' AND exam_goal = '${goal}' AND subject = 'reading' AND finalized_at IS NOT NULL AND is_correct = 0 ORDER BY finalized_at DESC LIMIT 50;"`,
    "```",
    "",
    `## Coaching (${coaching.length})`,
    coaching.length ? materialLines(coaching) : "(none)",
    "",
    `## Practice sources / Passage sets (${practiceSources.length})`,
    "Join Passage sets before diagnosing language gaps in the article + its questions.",
    practiceSources.length ? materialLines(practiceSources) : "(none)",
    "",
    "Download R2 files as needed:",
    "```sh",
    `npx wrangler r2 object get ${CODEX_R2_BUCKET}/R2_KEY --file /tmp/source.bin --remote`,
    "```",
    "",
    "## What to produce (remediation plan)",
    "Write assumptions clearly labelled as assumptions when evidence is thin.",
    "Include:",
    "1) Mistake diagnosis — 3–6 likely reasons ${nickname} struggles (e.g. unknown idiom, missed pronoun link,",
    "   over-literal reading, skipped qualifier). Tie each to a shelf source or coaching note when possible.",
    "2) Language list — vocabulary, phrases and tough sentences she may misunderstand.",
    "   For each item give: the form as seen in context · kid-facing correct meaning · one short example sentence.",
    "3) Copywork drill — ask her to handwrite each target item carefully several times (suggest 5–10 lines each,",
    "   or whole sentences for longer phrases). Keep the list short enough for one sitting (about 6–12 targets).",
    "4) Photo check protocol for the parent:",
    "   - After writing, photograph the page(s)",
    "   - Upload to Reading shelf as Practice questions (misc. source) with Passage set:",
    `     Handwriting · ${planId}`,
    "     and Page N of M",
    "   - Then re-run this remediation task (or Ask Codex on the coaching note) so Codex can mark spelling,",
    "     missing words, and whether meanings still look confused",
    "5) Next Reading practice tip — one short focus for the next generated article set.",
    "",
    "Save the plan:",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "INSERT INTO learning_evidence (id, profile_id, exam_goal, subject, kind, ref_id, summary, created_at) VALUES ('${evidenceId}', '${profileId}', '${goal}', 'reading', 'reading_remediation', '${planId}', 'REMEDIATION_PLAN_TEXT', '${stamp}');"`,
    "```",
    "Keep summary ≤4000 chars (split rows with the same ref_id if needed). Kid-facing language in English;",
    "optional short parent_zh tips may be woven into the summary.",
    "",
    "Then tell the parent to refresh Parent room → Reading → Evidence, run the copywork, upload handwriting photos,",
    "and ask Codex again to cross-check progress.",
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

  const readingJoin = material.subject === "reading"
    ? [
        "",
        "## Multi-page Reading passages (join images)",
        "A Reading article may need several screenshots (e.g. 4 pages for a passage + 3 sample questions).",
        "If this item belongs to a Passage set:",
        "1. List sibling Reading shelf rows for the same child/archive:",
        "```sh",
        `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "SELECT id, title, notes, file_key, file_name FROM shelf_materials WHERE profile_id = '${profileId}' AND exam_goal = '${material.examGoal}' AND subject = 'reading' ORDER BY created_at DESC, id DESC;"`,
        "```",
        "2. Match partners by the same `Passage set: …` notes line (preferred), or Part/Page N of M / shared stem title.",
        "3. Download every matched image/PDF from R2, read them in page order, and treat them as ONE continuous source unit.",
        "4. Write a single analysis for THIS material_id that summarises the joined passage and the style of any source questions.",
        "   Put a short joined excerpt in source_excerpt and list all partner material ids in evidence_limits.",
        "5. Do not invent missing lines between photos; if a join is uncertain, say so in evidence_limits.",
        "Prefer using the bulk Reading shelf review for practice-question sets; use this per-item path mainly for coaching reports.",
      ]
    : [];

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
    `- subject: ${material.subject}`,
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
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "SELECT id, profile_id, exam_goal, subject, kind, title, source_url, notes, file_key, file_name, file_type, created_by_user_id FROM shelf_materials WHERE id = '${material.id}' AND profile_id = '${profileId}';"`,
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
    ...readingJoin,
    "",
    "## What to produce",
    "- summary_en: English practice signals from the source",
    "- parent_zh: optional Chinese parent reading, or empty",
    "- training_directions: up to 5 concrete next practice directions (JSON array string)",
    "- evidence_limits: what this source does NOT prove",
    material.subject === "reading"
      ? "- source_excerpt: short excerpt from the joined continuous passage when pages were merged (max 8000 chars)"
      : "- source_excerpt: short excerpt/notes used (max 8000 chars)",
    "",
    "## Where to save (remote D1)",
    "Insert one succeeded analysis and one learning_evidence row. Use these ids/timestamps unless collisions force new ones:",
    `- analysis id: ${analysisId}`,
    `- evidence id: ${evidenceId}`,
    `- completed_at / created_at: ${stamp}`,
    `- model: codex`,
    "",
    "```sh",
    `npx wrangler d1 execute ${CODEX_D1_NAME} --remote --config wrangler.d1.jsonc --command "INSERT INTO material_analyses (id, material_id, profile_id, exam_goal, subject, status, summary_en, parent_zh, training_directions_json, evidence_limits, source_excerpt, model, created_by_user_id, created_at, completed_at) VALUES ('${analysisId}', '${material.id}', '${profileId}', '${material.examGoal}', '${material.subject}', 'succeeded', 'SUMMARY_EN', NULL, '[\\"DIRECTION\\"]', 'LIMITS', 'EXCERPT', 'codex', '${actorUserId}', '${stamp}', '${stamp}'); INSERT INTO learning_evidence (id, profile_id, exam_goal, subject, kind, ref_id, summary, created_at) VALUES ('${evidenceId}', '${profileId}', '${material.examGoal}', '${material.subject}', 'material_analysis', '${analysisId}', 'SUMMARY_EN', '${stamp}');"`,
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
           (id, material_id, profile_id, exam_goal, subject, status, summary_en, parent_zh,
            training_directions_json, evidence_limits, source_excerpt, model,
            created_by_user_id, created_at, completed_at)
         VALUES (?, ?, ?, ?, ?, 'succeeded', ?, ?, ?, ?, ?, 'codex', ?, ?, ?)`,
      ).bind(
        analysisId,
        materialId,
        profileId,
        material.examGoal,
        material.subject,
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
        `INSERT INTO learning_evidence (id, profile_id, exam_goal, subject, kind, ref_id, summary, created_at)
         VALUES (?, ?, ?, ?, 'material_analysis', ?, ?, ?)`,
      ).bind(evidenceId, profileId, material.examGoal, material.subject, analysisId, input.summaryEn, stamp),
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
