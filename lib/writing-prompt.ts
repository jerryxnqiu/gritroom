import type { ExamGoal } from "./family";

export type WritingPrompt = {
  id: string;
  refId: string;
  createdAt: string;
  summary: string;
  status: "active" | "archived";
  title: string;
  form: string | null;
  audience: string | null;
  minutes: number;
  focusSkill: string | null;
  brief: string;
  whyThisPrompt: string | null;
};

const parentAccess = `EXISTS (
  SELECT 1 FROM guardian_grants g WHERE g.family_id = p.family_id AND g.user_id = ?
    AND g.revoked_at IS NULL
    AND (g.profile_id = p.id OR (g.profile_id IS NULL AND g.role IN ('owner', 'admin')))
)`;

const tipViewerAccess = `EXISTS (
  SELECT 1 FROM (
    SELECT profile_id, user_id FROM learner_links
    UNION ALL
    SELECT profile_id, user_id FROM coach_links
  ) v WHERE v.profile_id = e.profile_id AND v.user_id = ?
)`;

const BLOCK_LABELS = [
  "Status",
  "Title",
  "Form",
  "Audience",
  "Minutes",
  "Focus skill",
  "Brief",
  "Why this prompt",
] as const;

/** Split labelled Writing prompt / mark blocks into a map of label → body. */
export function parseLabeledBlocks(summary: string) {
  const lines = summary.replace(/\r\n/g, "\n").split("\n");
  const blocks = new Map<string, string>();
  let current: string | null = null;
  const buffer: string[] = [];

  function flush() {
    if (!current) return;
    blocks.set(current, buffer.join("\n").trim());
    buffer.length = 0;
  }

  for (const line of lines) {
    const match = line.match(/^([A-Za-z][A-Za-z ]*):(?:\s*(.*))?$/);
    const label = match?.[1]?.trim() || "";
    const known = BLOCK_LABELS.find((item) => item.toLowerCase() === label.toLowerCase());
    if (known) {
      flush();
      current = known;
      const rest = (match?.[2] || "").trim();
      if (rest) buffer.push(rest);
      continue;
    }
    if (current) buffer.push(line);
  }
  flush();
  return blocks;
}

/** Parse a Codex-written writing_prompt summary. */
export function parseWritingPromptSummary(summary: string): Omit<WritingPrompt, "id" | "refId" | "createdAt" | "summary"> | null {
  const text = summary.trim();
  if (!text) return null;
  const blocks = parseLabeledBlocks(text);
  const title = blocks.get("Title")?.trim();
  const brief = blocks.get("Brief")?.trim();
  if (!title || !brief) return null;

  const statusRaw = (blocks.get("Status") || "active").trim().toLowerCase();
  const minutesRaw = Number((blocks.get("Minutes") || "30").trim());
  return {
    status: statusRaw === "archived" ? "archived" : "active",
    title,
    form: blocks.get("Form")?.trim() || null,
    audience: blocks.get("Audience")?.trim() || null,
    minutes: Number.isFinite(minutesRaw) && minutesRaw > 0 ? minutesRaw : 30,
    focusSkill: blocks.get("Focus skill")?.trim() || null,
    brief,
    whyThisPrompt: blocks.get("Why this prompt")?.trim() || null,
  };
}

function mapRow(row: { id: string; refId: string; createdAt: string; summary: string }): WritingPrompt | null {
  const parsed = parseWritingPromptSummary(row.summary);
  if (!parsed) return null;
  return {
    id: row.id,
    refId: row.refId,
    createdAt: row.createdAt,
    summary: row.summary,
    ...parsed,
  };
}

async function listWritingPromptRows(
  db: D1Database,
  profileId: string,
  goal: ExamGoal,
  userId: string,
  accessSql: string,
  limit: number,
) {
  const { results } = await db.prepare(
    `SELECT e.id, e.ref_id AS refId, e.created_at AS createdAt, e.summary
     FROM learning_evidence e
     JOIN profiles p ON p.id = e.profile_id
     WHERE e.profile_id = ? AND e.exam_goal = ? AND e.subject = 'writing'
       AND e.kind = 'writing_prompt'
       AND e.summary IS NOT NULL AND length(trim(e.summary)) > 0
       AND ${accessSql}
     ORDER BY e.created_at DESC, e.id DESC
     LIMIT ?`,
  ).bind(profileId, goal, userId, limit).all<{
    id: string;
    refId: string;
    createdAt: string;
    summary: string;
  }>();
  return results.map(mapRow).filter((item): item is WritingPrompt => Boolean(item));
}

export async function listWritingPrompts(
  db: D1Database,
  profileId: string,
  goal: ExamGoal,
  userId: string,
  limit = 20,
) {
  return listWritingPromptRows(db, profileId, goal, userId, parentAccess, limit);
}

export async function listLearnerWritingPrompts(
  db: D1Database,
  profileId: string,
  goal: ExamGoal,
  userId: string,
  limit = 20,
) {
  return listWritingPromptRows(db, profileId, goal, userId, tipViewerAccess, limit);
}

/** Newest active prompt, else newest prompt overall. */
export function pickActiveWritingPrompt(prompts: WritingPrompt[]) {
  return prompts.find((item) => item.status === "active") ?? prompts[0] ?? null;
}
