import type { ExamGoal } from "./family";
import type { PracticeResultSessionSummary } from "./practice.ts";

export const WRITING_RUBRIC_MAX = 5;
export const WRITING_TOTAL_MAX = 15;

export type WritingRubricScores = {
  taskResponse: number;
  organisation: number;
  languageControl: number;
};

export type WritingMark = {
  id: string;
  refId: string;
  createdAt: string;
  summary: string;
  scores: WritingRubricScores;
  total: number;
  weakest: string | null;
  kidNotes: string | null;
  nextFocus: string | null;
  promptTitle: string | null;
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

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(WRITING_RUBRIC_MAX, Math.round(value)));
}

function scoreFromMatch(summary: string, label: RegExp) {
  const match = summary.match(label);
  if (!match?.[1]) return null;
  return clampScore(Number(match[1]));
}

/** Parse a Codex-written writing_mark summary into rubric scores. */
export function parseWritingMarkSummary(summary: string): Omit<WritingMark, "id" | "refId" | "createdAt" | "summary"> | null {
  const text = summary.trim();
  if (!text) return null;

  const taskResponse = scoreFromMatch(text, /Task response:\s*(\d+)\s*\/\s*5/i);
  const organisation = scoreFromMatch(text, /Organisation:\s*(\d+)\s*\/\s*5/i);
  const languageControl = scoreFromMatch(
    text,
    /Language(?: control)?:\s*(\d+)\s*\/\s*5/i,
  );
  if (taskResponse === null || organisation === null || languageControl === null) return null;

  const totalMatch = text.match(/Total:\s*(\d+)\s*\/\s*15/i);
  const computed = taskResponse + organisation + languageControl;
  const stated = totalMatch?.[1] ? Number(totalMatch[1]) : NaN;
  const safeTotal = Number.isFinite(stated) && stated >= 0 && stated <= WRITING_TOTAL_MAX
    ? stated
    : computed;

  const weakestMatch = text.match(/Weakest:\s*(.+)$/im);
  const promptMatch = text.match(/Prompt title:\s*(.+)$/im);
  const kidNotesMatch = text.match(/Kid notes:\s*([\s\S]*?)(?:\nNext focus:|$)/i);
  const nextFocusMatch = text.match(/Next focus:\s*([\s\S]*?)$/i);

  return {
    scores: { taskResponse, organisation, languageControl },
    total: safeTotal,
    weakest: weakestMatch?.[1]?.trim() || null,
    kidNotes: kidNotesMatch?.[1]?.trim() || null,
    nextFocus: nextFocusMatch?.[1]?.trim() || null,
    promptTitle: promptMatch?.[1]?.trim() || null,
  };
}

function mapRow(row: { id: string; refId: string; createdAt: string; summary: string }): WritingMark | null {
  const parsed = parseWritingMarkSummary(row.summary);
  if (!parsed) return null;
  return {
    id: row.id,
    refId: row.refId,
    createdAt: row.createdAt,
    summary: row.summary,
    ...parsed,
  };
}

/** Parent-facing Writing marks for Progress / Evidence. */
export async function listWritingMarks(
  db: D1Database,
  profileId: string,
  goal: ExamGoal,
  userId: string,
  limit = 40,
) {
  const { results } = await db.prepare(
    `SELECT e.id, e.ref_id AS refId, e.created_at AS createdAt, e.summary
     FROM learning_evidence e
     JOIN profiles p ON p.id = e.profile_id
     WHERE e.profile_id = ? AND e.exam_goal = ? AND e.subject = 'writing'
       AND e.kind = 'writing_mark'
       AND e.summary IS NOT NULL AND length(trim(e.summary)) > 0
       AND ${parentAccess}
     ORDER BY e.created_at DESC, e.id DESC
     LIMIT ?`,
  ).bind(profileId, goal, userId, limit).all<{
    id: string;
    refId: string;
    createdAt: string;
    summary: string;
  }>();

  return results.map(mapRow).filter((item): item is WritingMark => Boolean(item));
}

/** Learner / coach view of Writing marks (kid notes + scores). */
export async function listLearnerWritingMarks(
  db: D1Database,
  profileId: string,
  goal: ExamGoal,
  userId: string,
  limit = 20,
) {
  const { results } = await db.prepare(
    `SELECT e.id, e.ref_id AS refId, e.created_at AS createdAt, e.summary
     FROM learning_evidence e
     WHERE e.profile_id = ? AND e.exam_goal = ? AND e.subject = 'writing'
       AND e.kind = 'writing_mark'
       AND e.summary IS NOT NULL AND length(trim(e.summary)) > 0
       AND ${tipViewerAccess}
     ORDER BY e.created_at DESC, e.id DESC
     LIMIT ?`,
  ).bind(profileId, goal, userId, limit).all<{
    id: string;
    refId: string;
    createdAt: string;
    summary: string;
  }>();

  return results.map(mapRow).filter((item): item is WritingMark => Boolean(item));
}

/** Map Writing marks onto the shared score-chart session shape (total out of 15). */
export function writingMarksAsScoreSessions(marks: WritingMark[]): PracticeResultSessionSummary[] {
  return [...marks]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .map((mark) => ({
      id: mark.id,
      mode: "writing",
      status: "completed",
      startedAt: mark.createdAt,
      completedAt: mark.createdAt,
      total: WRITING_TOTAL_MAX,
      correct: mark.total,
      incorrect: Math.max(0, WRITING_TOTAL_MAX - mark.total),
    }));
}

export function writingMarkPercent(mark: WritingMark) {
  return Math.round((mark.total / WRITING_TOTAL_MAX) * 100);
}
