import type { ExamGoal } from "./family";
import { createId } from "./ids.ts";
import { thinkingKnowledge } from "./thinking-knowledge.ts";
import { nowIso } from "./time.ts";

export type PracticeMode = "diagnostic" | "daily" | "timed" | "focus";
export type PracticeOptionKey = "A" | "B" | "C" | "D";

const WEAK_BLUEPRINT_LIMIT = 3;
const FOCUS_SET_SIZE = 5;

/** Official paper length / minutes for a timed Thinking Skills set. */
export function timedPaperSpec(goal: ExamGoal) {
  return goal === "oc"
    ? { questions: 30, minutes: 30, label: "30-question timed paper" }
    : { questions: 40, minutes: 40, label: "40-question timed paper" };
}

export type PracticeQuestion = {
  id: string;
  version: number;
  blueprintId: string;
  blueprintVersion: number;
  prompt: string;
  optionsJson: string;
  correctOption: string;
  imageKey: string | null;
  explanationEn: string | null;
};

export type PracticeAttemptView = {
  id: string;
  questionId: string | null;
  questionVersion: number | null;
  blueprintId: string | null;
  blueprintTitle: string | null;
  skill: string | null;
  prompt: string;
  options: Record<string, string>;
  imageKey: string | null;
  selectedOption: string | null;
  correctOption: string | null;
  isCorrect: boolean | null;
  confidence: number | null;
  timeMs: number | null;
  draftNotes: string | null;
  explanationEn: string | null;
  attemptReviewEn: string | null;
  finalizedAt: string | null;
  createdAt: string;
};

export type PracticeSessionView = {
  id: string;
  profileId: string;
  examGoal: ExamGoal;
  mode: PracticeMode;
  status: "active" | "completed" | "abandoned";
  startedAt: string;
  completedAt: string | null;
  attempts: PracticeAttemptView[];
};

export type PracticeEvidenceItem = {
  id: string;
  sessionId: string;
  mode: string;
  prompt: string;
  options: Record<string, string>;
  imageKey: string | null;
  blueprintTitle: string | null;
  skill: string | null;
  selectedOption: string;
  correctOption: string;
  isCorrect: boolean;
  confidence: number | null;
  timeMs: number | null;
  draftNotes: string | null;
  explanationEn: string | null;
  attemptReviewEn: string | null;
  finalizedAt: string;
};

export type PracticeEvidenceSession = {
  id: string;
  mode: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  total: number;
  correct: number;
  incorrect: number;
  attempts: PracticeEvidenceItem[];
};

const parentAccess = `EXISTS (
  SELECT 1 FROM guardian_grants g WHERE g.family_id = p.family_id AND g.user_id = ?
    AND g.revoked_at IS NULL
    AND (g.profile_id = p.id OR (g.profile_id IS NULL AND g.role IN ('owner', 'admin')))
)`;

type AttemptRow = {
  id: string;
  sessionId: string;
  questionId: string | null;
  questionVersion: number | null;
  blueprintId: string | null;
  blueprintVersion: number | null;
  blueprintTitle: string | null;
  skill: string | null;
  prompt: string;
  optionsJson: string;
  imageKey: string | null;
  correctOption: string;
  selectedOption: string | null;
  isCorrect: number | null;
  confidence: number | null;
  timeMs: number | null;
  draftNotes: string | null;
  explanationEn: string | null;
  attemptReviewEn: string | null;
  finalizedAt: string | null;
  createdAt: string;
  mode?: string;
};

function parseOptions(json: string) {
  try {
    const value = JSON.parse(json) as Record<string, string>;
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function toAttemptView(row: AttemptRow, revealAnswer: boolean): PracticeAttemptView {
  return {
    id: row.id,
    questionId: row.questionId,
    questionVersion: row.questionVersion,
    blueprintId: row.blueprintId,
    blueprintTitle: row.blueprintTitle,
    skill: row.skill,
    prompt: row.prompt,
    options: parseOptions(row.optionsJson),
    imageKey: row.imageKey,
    selectedOption: row.selectedOption,
    correctOption: revealAnswer || row.finalizedAt ? row.correctOption : null,
    isCorrect: row.isCorrect === null ? null : Boolean(row.isCorrect),
    confidence: row.confidence,
    timeMs: row.timeMs,
    draftNotes: row.draftNotes,
    explanationEn: row.finalizedAt ? row.explanationEn : null,
    attemptReviewEn: row.finalizedAt ? row.attemptReviewEn : null,
    finalizedAt: row.finalizedAt,
    createdAt: row.createdAt,
  };
}

function shuffleQuestions(bank: PracticeQuestion[]) {
  const copy = [...bank];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function pickQuestions(bank: PracticeQuestion[], mode: PracticeMode, goal: ExamGoal) {
  if (!bank.length) return [];
  if (mode === "diagnostic") return bank;
  const shuffled = shuffleQuestions(bank);
  if (mode === "timed") {
    return shuffled.slice(0, timedPaperSpec(goal).questions);
  }
  return shuffled.slice(0, Math.min(FOCUS_SET_SIZE, shuffled.length));
}

/** Blueprints this learner misses most often (for focused short rounds). */
export async function listWeakBlueprintIds(
  db: D1Database,
  profileId: string,
  examGoal: ExamGoal,
  limit = WEAK_BLUEPRINT_LIMIT,
) {
  const { results } = await db.prepare(
    `SELECT a.blueprint_id AS blueprintId, COUNT(*) AS misses
     FROM practice_attempts a
     WHERE a.profile_id = ? AND a.exam_goal = ?
       AND a.finalized_at IS NOT NULL AND a.is_correct = 0
       AND a.blueprint_id IS NOT NULL
     GROUP BY a.blueprint_id
     ORDER BY misses DESC, a.blueprint_id
     LIMIT ?`,
  ).bind(profileId, examGoal, Math.max(1, limit)).all<{ blueprintId: string; misses: number }>();
  return results.map((row) => row.blueprintId);
}

export async function countUnusedWeakPracticeQuestions(
  db: D1Database,
  profileId: string,
  examGoal: ExamGoal,
) {
  const weakIds = await listWeakBlueprintIds(db, profileId, examGoal);
  if (!weakIds.length) return 0;
  const unused = await loadUnusedPracticeQuestions(db, profileId, examGoal, weakIds);
  return unused.length;
}

export async function learnerProfile(db: D1Database, userId: string) {
  return db.prepare(
    `SELECT p.id, p.exam_goal AS examGoal, p.nickname
     FROM learner_links l JOIN profiles p ON p.id = l.profile_id WHERE l.user_id = ?`,
  ).bind(userId).first<{ id: string; examGoal: ExamGoal; nickname: string }>();
}

export async function activePracticeSession(db: D1Database, profileId: string, examGoal: ExamGoal) {
  return db.prepare(
    `SELECT id FROM practice_sessions
     WHERE profile_id = ? AND exam_goal = ? AND status = 'active'
     ORDER BY started_at DESC LIMIT 1`,
  ).bind(profileId, examGoal).first<{ id: string }>();
}

/** Prefer an in-progress session; otherwise the most recent completed one for the learner room. */
export async function latestPracticeSession(db: D1Database, profileId: string, examGoal: ExamGoal) {
  const active = await activePracticeSession(db, profileId, examGoal);
  if (active) return active;
  return db.prepare(
    `SELECT id FROM practice_sessions
     WHERE profile_id = ? AND exam_goal = ? AND status = 'completed'
     ORDER BY completed_at DESC, started_at DESC LIMIT 1`,
  ).bind(profileId, examGoal).first<{ id: string }>();
}

/** Latest active bank items whose blueprints apply to the exam goal. */
export async function loadActivePracticeQuestions(db: D1Database, blueprintIds: string[]) {
  if (!blueprintIds.length) return [] as PracticeQuestion[];
  const placeholders = blueprintIds.map(() => "?").join(", ");
  const { results } = await db.prepare(
    `SELECT q.id, q.version, q.blueprint_id AS blueprintId, q.blueprint_version AS blueprintVersion,
            q.prompt, q.options_json AS optionsJson, q.correct_option AS correctOption,
            q.image_key AS imageKey, q.explanation_en AS explanationEn
     FROM practice_questions q
     WHERE q.status = 'active'
       AND q.blueprint_id IN (${placeholders})
       AND q.version = (
         SELECT MAX(other.version) FROM practice_questions other
         WHERE other.id = q.id AND other.status = 'active'
       )
     ORDER BY q.blueprint_id, q.id`,
  ).bind(...blueprintIds).all<PracticeQuestion>();
  return results;
}

/** Active bank items this learner has not yet answered for the current question version. */
export async function loadUnusedPracticeQuestions(
  db: D1Database,
  profileId: string,
  examGoal: ExamGoal,
  blueprintIds: string[],
) {
  if (!blueprintIds.length) return [] as PracticeQuestion[];
  const placeholders = blueprintIds.map(() => "?").join(", ");
  const { results } = await db.prepare(
    `SELECT q.id, q.version, q.blueprint_id AS blueprintId, q.blueprint_version AS blueprintVersion,
            q.prompt, q.options_json AS optionsJson, q.correct_option AS correctOption,
            q.image_key AS imageKey, q.explanation_en AS explanationEn
     FROM practice_questions q
     WHERE q.status = 'active'
       AND q.blueprint_id IN (${placeholders})
       AND q.version = (
         SELECT MAX(other.version) FROM practice_questions other
         WHERE other.id = q.id AND other.status = 'active'
       )
       AND NOT EXISTS (
         SELECT 1 FROM practice_attempts a
         WHERE a.profile_id = ? AND a.exam_goal = ?
           AND a.question_id = q.id AND a.question_version = q.version
           AND a.finalized_at IS NOT NULL
       )
     ORDER BY q.blueprint_id, q.id`,
  ).bind(...blueprintIds, profileId, examGoal).all<PracticeQuestion>();
  return results;
}

export async function countUnusedPracticeQuestions(
  db: D1Database,
  profileId: string,
  examGoal: ExamGoal,
) {
  const { blueprints } = await thinkingKnowledge(db, examGoal);
  const unused = await loadUnusedPracticeQuestions(
    db,
    profileId,
    examGoal,
    blueprints.map((item) => item.id),
  );
  return unused.length;
}

async function loadAttempts(db: D1Database, sessionId: string) {
  const { results } = await db.prepare(
    `SELECT a.id, a.session_id AS sessionId, a.question_id AS questionId, a.question_version AS questionVersion,
            a.blueprint_id AS blueprintId, a.blueprint_version AS blueprintVersion,
            b.title AS blueprintTitle, b.skill, a.question_prompt AS prompt, a.options_json AS optionsJson,
            a.image_key AS imageKey, a.correct_option AS correctOption, a.selected_option AS selectedOption,
            a.is_correct AS isCorrect, a.confidence, a.time_ms AS timeMs, a.draft_notes AS draftNotes,
            a.explanation_en AS explanationEn, a.attempt_review_en AS attemptReviewEn,
            a.finalized_at AS finalizedAt, a.created_at AS createdAt
     FROM practice_attempts a
     LEFT JOIN thinking_blueprints b ON b.id = a.blueprint_id AND b.version = a.blueprint_version
     WHERE a.session_id = ?
     ORDER BY a.created_at, a.id`,
  ).bind(sessionId).all<AttemptRow>();
  return results;
}

export async function getPracticeSession(db: D1Database, sessionId: string, userId: string) {
  const session = await db.prepare(
    `SELECT s.id, s.profile_id AS profileId, s.exam_goal AS examGoal, s.mode, s.status,
            s.started_at AS startedAt, s.completed_at AS completedAt
     FROM practice_sessions s
     JOIN learner_links l ON l.profile_id = s.profile_id AND l.user_id = ?
     WHERE s.id = ?`,
  ).bind(userId, sessionId).first<{
    id: string;
    profileId: string;
    examGoal: ExamGoal;
    mode: PracticeMode;
    status: "active" | "completed" | "abandoned";
    startedAt: string;
    completedAt: string | null;
  }>();
  if (!session) return null;
  const attempts = await loadAttempts(db, session.id);
  return {
    ...session,
    attempts: attempts.map((row) => toAttemptView(row, session.status !== "active")),
  } satisfies PracticeSessionView;
}

export async function startPracticeSession(
  db: D1Database,
  userId: string,
  mode: PracticeMode,
): Promise<{ ok: true; session: PracticeSessionView } | { ok: false; status: number; error: string }> {
  const profile = await learnerProfile(db, userId);
  if (!profile) return { ok: false, status: 403, error: "Link a learner profile before starting practice." };

  const existing = await activePracticeSession(db, profile.id, profile.examGoal);
  if (existing) {
    const session = await getPracticeSession(db, existing.id, userId);
    if (session) return { ok: true, session };
  }

  const { blueprints } = await thinkingKnowledge(db, profile.examGoal);
  const allBlueprintIds = blueprints.map((item) => item.id);
  let dealBlueprintIds = allBlueprintIds;
  if (mode === "focus") {
    const weakIds = await listWeakBlueprintIds(db, profile.id, profile.examGoal);
    if (!weakIds.length) {
      return {
        ok: false,
        status: 409,
        error: "Weak-spot practice needs a few incorrect answers first. Do a short Practice set, then try again.",
      };
    }
    dealBlueprintIds = weakIds.filter((id) => allBlueprintIds.includes(id));
    if (!dealBlueprintIds.length) {
      return {
        ok: false,
        status: 409,
        error: "Your weak-spot skills are not in this exam archive’s bank yet. Ask your family to refresh the practice bank.",
      };
    }
  }

  const unused = await loadUnusedPracticeQuestions(
    db,
    profile.id,
    profile.examGoal,
    dealBlueprintIds,
  );
  if (!unused.length) {
    const bank = await loadActivePracticeQuestions(db, dealBlueprintIds);
    if (!bank.length && mode === "focus") {
      return {
        ok: false,
        status: 409,
        error: "No unused questions left for your weak spots. Ask your family to refresh the practice bank for those skills.",
      };
    }
    if (!bank.length) {
      return { ok: false, status: 503, error: "Practice questions for this exam goal are not ready yet." };
    }
    return {
      ok: false,
      status: 409,
      error: mode === "focus"
        ? "No unused questions left for your weak spots. Ask your family to refresh the practice bank for those skills."
        : "You have finished every practice question available right now. Ask your family to refresh the practice bank for new ones.",
    };
  }
  if (mode === "timed") {
    const paper = timedPaperSpec(profile.examGoal);
    if (unused.length < paper.questions) {
      return {
        ok: false,
        status: 409,
        error: `A ${paper.label} needs ${paper.questions} unused questions. ${unused.length} left in the bank — ask your family to refresh, or use Practice for a short set.`,
      };
    }
  }
  const questions = pickQuestions(unused, mode, profile.examGoal);

  const sessionId = createId("psn");
  const startedAt = nowIso();
  try {
    await db.batch([
      db.prepare(
        `INSERT INTO practice_sessions (id, profile_id, exam_goal, mode, status, started_at)
         VALUES (?, ?, ?, ?, 'active', ?)`,
      ).bind(sessionId, profile.id, profile.examGoal, mode, startedAt),
      ...questions.map((question, index) => {
        const stamp = new Date(Date.parse(startedAt) + index).toISOString();
        return db.prepare(
          `INSERT INTO practice_attempts
             (id, session_id, profile_id, exam_goal, question_id, question_version,
              blueprint_id, blueprint_version, question_prompt, options_json, correct_option,
              image_key, explanation_en, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          createId("pat"),
          sessionId,
          profile.id,
          profile.examGoal,
          question.id,
          question.version,
          question.blueprintId,
          question.blueprintVersion,
          question.prompt,
          question.optionsJson,
          question.correctOption,
          question.imageKey,
          question.explanationEn,
          stamp,
        );
      }),
    ]);
  } catch {
    return { ok: false, status: 503, error: "Could not start practice. Try again." };
  }

  const session = await getPracticeSession(db, sessionId, userId);
  if (!session) return { ok: false, status: 503, error: "Could not load the new practice session." };
  return { ok: true, session };
}

async function writeAttemptEvidence(
  db: D1Database,
  session: PracticeSessionView,
  attemptId: string,
  summary: string,
  stamp: string,
) {
  await db.prepare(
    `INSERT INTO learning_evidence (id, profile_id, exam_goal, kind, ref_id, summary, created_at)
     VALUES (?, ?, ?, 'attempt', ?, ?, ?)`,
  ).bind(createId("evd"), session.profileId, session.examGoal, attemptId, summary.slice(0, 4000), stamp).run();
}

/** Timed paper: save or change an answer without locking the paper. */
export async function saveTimedDraft(
  db: D1Database,
  userId: string,
  sessionId: string,
  input: {
    attemptId: string;
    selectedOption: string;
    timeMs: number;
  },
): Promise<{ ok: true; session: PracticeSessionView; attempt: PracticeAttemptView } | { ok: false; status: number; error: string }> {
  const option = input.selectedOption.trim().toUpperCase();
  if (!/^[A-D]$/.test(option)) return { ok: false, status: 400, error: "Choose one of the answer options." };
  if (!Number.isInteger(input.timeMs) || input.timeMs < 0 || input.timeMs > 60 * 60 * 1000) {
    return { ok: false, status: 400, error: "Practice time looks invalid. Try again." };
  }

  const session = await getPracticeSession(db, sessionId, userId);
  if (!session) return { ok: false, status: 404, error: "That practice session is unavailable." };
  if (session.status !== "active") return { ok: false, status: 409, error: "This practice session is already finished." };
  if (session.mode !== "timed") return { ok: false, status: 409, error: "Draft answers are only for timed papers." };

  const current = session.attempts.find((item) => item.id === input.attemptId);
  if (!current) return { ok: false, status: 404, error: "That question is not part of this session." };
  if (current.finalizedAt) return { ok: false, status: 409, error: "That answer is already locked." };

  const prior = await db.prepare(
    `SELECT time_ms AS timeMs FROM practice_attempts
     WHERE id = ? AND session_id = ? AND finalized_at IS NULL`,
  ).bind(input.attemptId, sessionId).first<{ timeMs: number | null }>();
  if (!prior) return { ok: false, status: 404, error: "That question is not part of this session." };

  const totalTime = Math.min(60 * 60 * 1000, Math.max(0, Number(prior.timeMs ?? 0) + input.timeMs));
  const updated = await db.prepare(
    `UPDATE practice_attempts
     SET selected_option = ?, time_ms = ?, confidence = COALESCE(confidence, 3), draft_notes = NULL
     WHERE id = ? AND session_id = ? AND finalized_at IS NULL`,
  ).bind(option, totalTime, input.attemptId, sessionId).run();
  if (!updated.meta.changes) return { ok: false, status: 409, error: "Could not save that answer." };

  const next = await getPracticeSession(db, sessionId, userId);
  if (!next) return { ok: false, status: 503, error: "Answer saved, but the session could not be reloaded." };
  const attempt = next.attempts.find((item) => item.id === input.attemptId);
  if (!attempt) return { ok: false, status: 503, error: "Answer saved, but the attempt could not be reloaded." };
  return { ok: true, session: next, attempt };
}

/** Timed paper: lock every answered question, score them, and complete the session. */
export async function submitTimedPaper(
  db: D1Database,
  userId: string,
  sessionId: string,
): Promise<{ ok: true; session: PracticeSessionView } | { ok: false; status: number; error: string }> {
  const session = await getPracticeSession(db, sessionId, userId);
  if (!session) return { ok: false, status: 404, error: "That practice session is unavailable." };
  if (session.status !== "active") return { ok: false, status: 409, error: "This practice session is already finished." };
  if (session.mode !== "timed") return { ok: false, status: 409, error: "Only timed papers use a final submit." };

  const unanswered = session.attempts.filter((item) => !item.selectedOption).length;
  if (unanswered > 0) {
    return {
      ok: false,
      status: 409,
      error: `${unanswered} question${unanswered === 1 ? "" : "s"} still unanswered. Go back and choose an answer for each, then submit.`,
    };
  }

  const stamp = nowIso();
  const openRows = await db.prepare(
    `SELECT id, correct_option AS correctOption, selected_option AS selectedOption,
            question_prompt AS prompt, confidence, time_ms AS timeMs
     FROM practice_attempts
     WHERE session_id = ? AND finalized_at IS NULL`,
  ).bind(sessionId).all<{
    id: string;
    correctOption: string;
    selectedOption: string;
    prompt: string;
    confidence: number | null;
    timeMs: number | null;
  }>();

  try {
    await db.batch([
      ...openRows.results.map((row) => {
        const correct = row.selectedOption === row.correctOption;
        return db.prepare(
          `UPDATE practice_attempts
           SET is_correct = ?, confidence = COALESCE(confidence, 3), finalized_at = ?
           WHERE id = ? AND session_id = ? AND finalized_at IS NULL`,
        ).bind(correct ? 1 : 0, stamp, row.id, sessionId);
      }),
      db.prepare(
        `UPDATE practice_sessions SET status = 'completed', completed_at = ? WHERE id = ? AND status = 'active'`,
      ).bind(stamp, sessionId),
    ]);
  } catch {
    return { ok: false, status: 503, error: "Could not submit the paper. Try again." };
  }

  for (const row of openRows.results) {
    const correct = row.selectedOption === row.correctOption;
    const summary = [
      correct ? "Correct" : "Incorrect",
      `answer ${row.selectedOption}`,
      `confidence ${row.confidence ?? 3}/5`,
      `${Math.round(Number(row.timeMs ?? 0) / 1000)}s`,
      row.prompt.slice(0, 180),
    ].join(" · ");
    await writeAttemptEvidence(db, session, row.id, summary, stamp);
  }

  const next = await getPracticeSession(db, sessionId, userId);
  if (!next) return { ok: false, status: 503, error: "Paper submitted, but the session could not be reloaded." };
  return { ok: true, session: next };
}

export async function submitPracticeAttempt(
  db: D1Database,
  userId: string,
  sessionId: string,
  input: {
    attemptId: string;
    selectedOption: string;
    confidence: number;
    timeMs: number;
    draftNotes: string;
  },
): Promise<{ ok: true; session: PracticeSessionView; attempt: PracticeAttemptView } | { ok: false; status: number; error: string }> {
  const option = input.selectedOption.trim().toUpperCase();
  if (!/^[A-D]$/.test(option)) return { ok: false, status: 400, error: "Choose one of the answer options." };
  if (!Number.isInteger(input.confidence) || input.confidence < 1 || input.confidence > 5) {
    return { ok: false, status: 400, error: "Confidence must be a whole number from 1 to 5." };
  }
  if (!Number.isInteger(input.timeMs) || input.timeMs < 0 || input.timeMs > 60 * 60 * 1000) {
    return { ok: false, status: 400, error: "Practice time looks invalid. Try again." };
  }
  const notes = input.draftNotes.trim();
  if (notes.length > 8000) return { ok: false, status: 400, error: "Keep draft notes under 8000 characters." };

  const session = await getPracticeSession(db, sessionId, userId);
  if (!session) return { ok: false, status: 404, error: "That practice session is unavailable." };
  if (session.status !== "active") return { ok: false, status: 409, error: "This practice session is already finished." };
  if (session.mode === "timed") {
    return { ok: false, status: 409, error: "Timed papers save drafts as you go. Use Submit paper when you are finished." };
  }

  const current = session.attempts.find((item) => item.id === input.attemptId);
  if (!current) return { ok: false, status: 404, error: "That question is not part of this session." };
  if (current.finalizedAt) return { ok: false, status: 409, error: "That answer is already saved." };

  const open = session.attempts.find((item) => !item.finalizedAt);
  if (!open || open.id !== input.attemptId) {
    return { ok: false, status: 409, error: "Answer the current question before moving on." };
  }

  const row = await db.prepare(
    `SELECT correct_option AS correctOption, question_prompt AS prompt, blueprint_id AS blueprintId
     FROM practice_attempts WHERE id = ? AND session_id = ? AND finalized_at IS NULL`,
  ).bind(input.attemptId, sessionId).first<{ correctOption: string; prompt: string; blueprintId: string | null }>();
  if (!row) return { ok: false, status: 404, error: "That question is not part of this session." };

  const correct = row.correctOption === option;
  const stamp = nowIso();
  const updated = await db.prepare(
    `UPDATE practice_attempts
     SET selected_option = ?, is_correct = ?, confidence = ?, time_ms = ?, draft_notes = ?, finalized_at = ?
     WHERE id = ? AND session_id = ? AND finalized_at IS NULL`,
  ).bind(option, correct ? 1 : 0, input.confidence, input.timeMs, notes || null, stamp, input.attemptId, sessionId).run();
  if (!updated.meta.changes) return { ok: false, status: 409, error: "That answer is already saved." };

  const summary = [
    correct ? "Correct" : "Incorrect",
    `answer ${option}`,
    `confidence ${input.confidence}/5`,
    `${Math.round(input.timeMs / 1000)}s`,
    row.prompt.slice(0, 180),
  ].join(" · ");
  await writeAttemptEvidence(db, session, input.attemptId, summary, stamp);

  const remaining = await db.prepare(
    `SELECT COUNT(*) AS openCount FROM practice_attempts WHERE session_id = ? AND finalized_at IS NULL`,
  ).bind(sessionId).first<{ openCount: number }>();
  if (remaining && Number(remaining.openCount) === 0) {
    await db.prepare(
      `UPDATE practice_sessions SET status = 'completed', completed_at = ? WHERE id = ? AND status = 'active'`,
    ).bind(stamp, sessionId).run();
  }

  const next = await getPracticeSession(db, sessionId, userId);
  if (!next) return { ok: false, status: 503, error: "Answer saved, but the session could not be reloaded." };
  const attempt = next.attempts.find((item) => item.id === input.attemptId);
  if (!attempt) return { ok: false, status: 503, error: "Answer saved, but the attempt could not be reloaded." };
  return { ok: true, session: next, attempt };
}

export async function findAttemptImage(
  db: D1Database,
  attemptId: string,
  userId: string,
  entry: "learner" | "parent",
) {
  if (entry === "learner") {
    return db.prepare(
      `SELECT a.image_key AS key
       FROM practice_attempts a
       JOIN learner_links l ON l.profile_id = a.profile_id AND l.user_id = ?
       WHERE a.id = ? AND a.image_key IS NOT NULL`,
    ).bind(userId, attemptId).first<{ key: string }>();
  }
  return db.prepare(
    `SELECT a.image_key AS key
     FROM practice_attempts a
     JOIN profiles p ON p.id = a.profile_id
     WHERE a.id = ? AND a.image_key IS NOT NULL AND ${parentAccess}`,
  ).bind(attemptId, userId).first<{ key: string }>();
}

const EVIDENCE_SESSION_LIMIT = 20;

export type PracticeEvidenceModeFilter = PracticeMode | "all";

export type PracticeResultSessionSummary = {
  id: string;
  mode: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  total: number;
  correct: number;
  incorrect: number;
};

export function parseEvidenceModeFilter(value: unknown): PracticeEvidenceModeFilter | null {
  if (value === undefined || value === null || value === "" || value === "all") return "all";
  return parsePracticeMode(value);
}

async function listPracticeSessionSummaries(
  db: D1Database,
  profileId: string,
  examGoal: ExamGoal,
  accessSql: string,
  accessBind: string,
  options?: {
    sessionLimit?: number;
    sessionOffset?: number;
    mode?: PracticeEvidenceModeFilter;
  },
) {
  const limit = Math.min(Math.max(options?.sessionLimit ?? EVIDENCE_SESSION_LIMIT, 1), 50);
  const offset = Math.max(options?.sessionOffset ?? 0, 0);
  const mode = options?.mode ?? "all";
  const modeClause = mode === "all" ? "" : " AND s.mode = ?";
  const binds = mode === "all"
    ? [profileId, examGoal, accessBind, limit, offset]
    : [profileId, examGoal, mode, accessBind, limit, offset];

  const sessions = await db.prepare(
    `SELECT s.id, s.mode, s.status, s.started_at AS startedAt, s.completed_at AS completedAt,
            COUNT(a.id) AS total,
            SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) AS correctCount
     FROM practice_sessions s
     JOIN profiles p ON p.id = s.profile_id
     JOIN practice_attempts a ON a.session_id = s.id AND a.finalized_at IS NOT NULL
     WHERE s.profile_id = ? AND s.exam_goal = ?${modeClause} AND ${accessSql}
     GROUP BY s.id
     ORDER BY COALESCE(s.completed_at, s.started_at) DESC, s.id DESC
     LIMIT ? OFFSET ?`,
  ).bind(...binds).all<{
    id: string;
    mode: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    total: number;
    correctCount: number;
  }>();

  return sessions.results.map((session): PracticeResultSessionSummary => {
    const total = Number(session.total);
    const correct = Number(session.correctCount);
    return {
      id: session.id,
      mode: session.mode,
      status: session.status,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      total,
      correct,
      incorrect: Math.max(0, total - correct),
    };
  });
}

async function loadPracticeSessionAttempts(db: D1Database, sessionIds: string[]) {
  if (!sessionIds.length) return new Map<string, PracticeEvidenceItem[]>();
  const placeholders = sessionIds.map(() => "?").join(", ");
  const { results: attemptRows } = await db.prepare(
    `SELECT a.id, a.session_id AS sessionId, s.mode, a.question_prompt AS prompt,
            a.options_json AS optionsJson, a.image_key AS imageKey,
            b.title AS blueprintTitle, b.skill, a.selected_option AS selectedOption,
            a.correct_option AS correctOption, a.is_correct AS isCorrect, a.confidence,
            a.time_ms AS timeMs, a.draft_notes AS draftNotes,
            a.explanation_en AS explanationEn, a.attempt_review_en AS attemptReviewEn,
            a.finalized_at AS finalizedAt
     FROM practice_attempts a
     JOIN practice_sessions s ON s.id = a.session_id
     LEFT JOIN thinking_blueprints b ON b.id = a.blueprint_id AND b.version = a.blueprint_version
     WHERE a.session_id IN (${placeholders}) AND a.finalized_at IS NOT NULL
     ORDER BY a.created_at, a.id`,
  ).bind(...sessionIds).all<AttemptRow & {
    selectedOption: string;
    correctOption: string;
    isCorrect: number;
    finalizedAt: string;
  }>();

  const bySession = new Map<string, PracticeEvidenceItem[]>();
  for (const row of attemptRows) {
    const item: PracticeEvidenceItem = {
      id: row.id,
      sessionId: row.sessionId,
      mode: row.mode || "daily",
      prompt: row.prompt,
      options: parseOptions(row.optionsJson),
      imageKey: row.imageKey,
      blueprintTitle: row.blueprintTitle,
      skill: row.skill,
      selectedOption: row.selectedOption,
      correctOption: row.correctOption,
      isCorrect: Boolean(row.isCorrect),
      confidence: row.confidence,
      timeMs: row.timeMs,
      draftNotes: row.draftNotes,
      explanationEn: row.explanationEn,
      attemptReviewEn: row.attemptReviewEn,
      finalizedAt: row.finalizedAt,
    };
    const list = bySession.get(row.sessionId) ?? [];
    list.push(item);
    bySession.set(row.sessionId, list);
  }
  return bySession;
}

/** Session score cards for parent progress / evidence bird’s-eye view. */
export async function listPracticeEvidenceSummaries(
  db: D1Database,
  profileId: string,
  examGoal: ExamGoal,
  userId: string,
  options?: {
    sessionLimit?: number;
    sessionOffset?: number;
    mode?: PracticeEvidenceModeFilter;
  },
) {
  return listPracticeSessionSummaries(db, profileId, examGoal, parentAccess, userId, options);
}

export async function getPracticeEvidenceSession(
  db: D1Database,
  profileId: string,
  examGoal: ExamGoal,
  userId: string,
  sessionId: string,
) {
  const row = await db.prepare(
    `SELECT s.id, s.mode, s.status, s.started_at AS startedAt, s.completed_at AS completedAt,
            COUNT(a.id) AS total,
            SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) AS correctCount
     FROM practice_sessions s
     JOIN profiles p ON p.id = s.profile_id
     JOIN practice_attempts a ON a.session_id = s.id AND a.finalized_at IS NOT NULL
     WHERE s.id = ? AND s.profile_id = ? AND s.exam_goal = ? AND ${parentAccess}
     GROUP BY s.id`,
  ).bind(sessionId, profileId, examGoal, userId).first<{
    id: string;
    mode: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    total: number;
    correctCount: number;
  }>();
  if (!row) return null;
  const bySession = await loadPracticeSessionAttempts(db, [row.id]);
  const total = Number(row.total);
  const correct = Number(row.correctCount);
  return {
    id: row.id,
    mode: row.mode,
    status: row.status,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    total,
    correct,
    incorrect: Math.max(0, total - correct),
    attempts: bySession.get(row.id) ?? [],
  } satisfies PracticeEvidenceSession;
}

export async function listPracticeEvidence(
  db: D1Database,
  profileId: string,
  examGoal: ExamGoal,
  userId: string,
  options?: {
    sessionLimit?: number;
    sessionOffset?: number;
    mode?: PracticeEvidenceModeFilter;
  },
) {
  const summaries = await listPracticeSessionSummaries(
    db,
    profileId,
    examGoal,
    parentAccess,
    userId,
    options,
  );
  if (!summaries.length) return [] as PracticeEvidenceSession[];
  const bySession = await loadPracticeSessionAttempts(db, summaries.map((item) => item.id));
  return summaries.map((session): PracticeEvidenceSession => ({
    ...session,
    attempts: bySession.get(session.id) ?? [],
  }));
}

const learnerAccess = `EXISTS (
  SELECT 1 FROM learner_links l WHERE l.profile_id = s.profile_id AND l.user_id = ?
)`;

/** Session summaries for the linked learner — no attempt bodies until a session is opened. */
export async function listLearnerPracticeResults(
  db: D1Database,
  userId: string,
  options?: {
    sessionLimit?: number;
    sessionOffset?: number;
    mode?: PracticeEvidenceModeFilter;
  },
) {
  const profile = await learnerProfile(db, userId);
  if (!profile) return [] as PracticeResultSessionSummary[];
  return listPracticeSessionSummaries(
    db,
    profile.id,
    profile.examGoal,
    learnerAccess,
    userId,
    options,
  );
}

export async function getLearnerPracticeResultSession(
  db: D1Database,
  userId: string,
  sessionId: string,
) {
  const profile = await learnerProfile(db, userId);
  if (!profile) return null;
  const row = await db.prepare(
    `SELECT s.id, s.mode, s.status, s.started_at AS startedAt, s.completed_at AS completedAt,
            COUNT(a.id) AS total,
            SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) AS correctCount
     FROM practice_sessions s
     JOIN practice_attempts a ON a.session_id = s.id AND a.finalized_at IS NOT NULL
     WHERE s.id = ? AND s.profile_id = ? AND s.exam_goal = ? AND ${learnerAccess}
     GROUP BY s.id`,
  ).bind(sessionId, profile.id, profile.examGoal, userId).first<{
    id: string;
    mode: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    total: number;
    correctCount: number;
  }>();
  if (!row) return null;
  const bySession = await loadPracticeSessionAttempts(db, [row.id]);
  const total = Number(row.total);
  const correct = Number(row.correctCount);
  return {
    id: row.id,
    mode: row.mode,
    status: row.status,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    total,
    correct,
    incorrect: Math.max(0, total - correct),
    attempts: bySession.get(row.id) ?? [],
  } satisfies PracticeEvidenceSession;
}

/** Incorrect attempts still missing a personalised Codex review (this child + archive). */
export async function countIncorrectAttemptsNeedingReview(
  db: D1Database,
  profileId: string,
  examGoal: ExamGoal,
  userId: string,
) {
  const row = await db.prepare(
    `SELECT COUNT(*) AS total
     FROM practice_attempts a
     JOIN profiles p ON p.id = a.profile_id
     WHERE a.profile_id = ? AND a.exam_goal = ? AND a.finalized_at IS NOT NULL
       AND a.is_correct = 0 AND a.attempt_review_en IS NULL AND ${parentAccess}`,
  ).bind(profileId, examGoal, userId).first<{ total: number }>();
  return Number(row?.total ?? 0);
}

export function parsePracticeMode(value: unknown): PracticeMode | null {
  return value === "diagnostic" || value === "daily" || value === "timed" || value === "focus"
    ? value
    : null;
}

export function practiceModeLabel(mode: string) {
  if (mode === "diagnostic") return "Starting-point check";
  if (mode === "timed") return "Timed paper";
  if (mode === "focus") return "Weak-spot practice";
  return "Practice";
}

export function parseAttemptInput(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (typeof body.attemptId !== "string" || !body.attemptId.trim()) return null;
  if (typeof body.selectedOption !== "string") return null;
  if (typeof body.confidence !== "number") return null;
  if (typeof body.timeMs !== "number") return null;
  const draftNotes = typeof body.draftNotes === "string" ? body.draftNotes : "";
  return {
    attemptId: body.attemptId.trim(),
    selectedOption: body.selectedOption as PracticeOptionKey | string,
    confidence: body.confidence,
    timeMs: Math.round(body.timeMs),
    draftNotes,
  };
}

export function parseTimedDraftInput(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (typeof body.attemptId !== "string" || !body.attemptId.trim()) return null;
  if (typeof body.selectedOption !== "string") return null;
  if (typeof body.timeMs !== "number") return null;
  return {
    attemptId: body.attemptId.trim(),
    selectedOption: body.selectedOption as PracticeOptionKey | string,
    timeMs: Math.round(body.timeMs),
  };
}
