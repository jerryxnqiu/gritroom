import type { ExamGoal } from "./family";
import { createId } from "./ids.ts";
import { getPracticeSession, type PracticeMode, type PracticeSessionView } from "./practice.ts";
import { nowIso } from "./time.ts";

const SHORT_SET_SIZE = 10;

export type ReadingQuestion = {
  id: string;
  version: number;
  examGoal: ExamGoal;
  blueprintId: string | null;
  passageGroup: string;
  passageTitle: string;
  passageText: string;
  prompt: string;
  optionsJson: string;
  correctOption: string;
  explanationEn: string | null;
};

function combinedPrompt(question: ReadingQuestion) {
  return [
    question.passageTitle,
    "",
    question.passageText,
    "",
    question.prompt,
  ].join("\n").slice(0, 8000);
}

export async function countUnusedReadingQuestions(
  db: D1Database,
  profileId: string,
  examGoal: ExamGoal,
) {
  const unused = await loadUnusedReadingQuestions(db, profileId, examGoal);
  return unused.length;
}

export async function countIncorrectReadingAttempts(
  db: D1Database,
  profileId: string,
  examGoal: ExamGoal,
) {
  const row = await db.prepare(
    `SELECT COUNT(*) AS n FROM practice_attempts
     WHERE profile_id = ? AND exam_goal = ? AND subject = 'reading'
       AND finalized_at IS NOT NULL AND is_correct = 0`,
  ).bind(profileId, examGoal).first<{ n: number }>();
  return Number(row?.n ?? 0);
}

/**
 * Remediation unlocks on Reading misses; after a plan exists it stays locked until
 * new misses or handwriting photos arrive for a re-check.
 */
export async function readingRemediationAvailability(
  db: D1Database,
  profileId: string,
  examGoal: ExamGoal,
) {
  const [incorrectCount, lastPlan, handwritingCount] = await Promise.all([
    countIncorrectReadingAttempts(db, profileId, examGoal),
    db.prepare(
      `SELECT created_at AS createdAt FROM learning_evidence
       WHERE profile_id = ? AND exam_goal = ? AND subject = 'reading' AND kind = 'reading_remediation'
       ORDER BY created_at DESC LIMIT 1`,
    ).bind(profileId, examGoal).first<{ createdAt: string }>(),
    db.prepare(
      `SELECT COUNT(*) AS n FROM shelf_materials
       WHERE profile_id = ? AND exam_goal = ? AND subject = 'reading'
         AND (notes LIKE 'Passage set: Handwriting ·%' OR title LIKE 'Handwriting ·%')`,
    ).bind(profileId, examGoal).first<{ n: number }>(),
  ]);

  const handwritingUploads = Number(handwritingCount?.n ?? 0);

  if (!lastPlan) {
    if (incorrectCount === 0) {
      return {
        enabled: false,
        incorrectCount,
        reason: "No Reading mistakes yet. Remediation unlocks after incorrect Reading practice answers.",
      };
    }
    return {
      enabled: true,
      incorrectCount,
      reason: `${incorrectCount} incorrect Reading attempt${incorrectCount === 1 ? "" : "s"} ready to diagnose.`,
    };
  }

  const [newMisses, newHandwriting] = await Promise.all([
    db.prepare(
      `SELECT COUNT(*) AS n FROM practice_attempts
       WHERE profile_id = ? AND exam_goal = ? AND subject = 'reading'
         AND finalized_at IS NOT NULL AND is_correct = 0 AND finalized_at > ?`,
    ).bind(profileId, examGoal, lastPlan.createdAt).first<{ n: number }>(),
    db.prepare(
      `SELECT COUNT(*) AS n FROM shelf_materials
       WHERE profile_id = ? AND exam_goal = ? AND subject = 'reading'
         AND created_at > ?
         AND (notes LIKE 'Passage set: Handwriting ·%' OR title LIKE 'Handwriting ·%')`,
    ).bind(profileId, examGoal, lastPlan.createdAt).first<{ n: number }>(),
  ]);

  const freshMisses = Number(newMisses?.n ?? 0);
  const freshHandwriting = Number(newHandwriting?.n ?? 0);
  if (freshMisses === 0 && freshHandwriting === 0) {
    return {
      enabled: false,
      incorrectCount,
      reason: handwritingUploads > 0
        ? "Remediation plan already on file. Upload newer handwriting photos, or wait for new Reading misses, then run again."
        : "Remediation plan already on file. Unlock again after new Reading misses, or after uploading handwriting photos for a re-check.",
    };
  }

  return {
    enabled: true,
    incorrectCount,
    reason: freshHandwriting > 0
      ? `${freshHandwriting} new handwriting upload${freshHandwriting === 1 ? "" : "s"} ready for Codex to cross-check.`
      : `${freshMisses} new incorrect Reading attempt${freshMisses === 1 ? "" : "s"} since the last remediation plan.`,
  };
}

export async function loadUnusedReadingQuestions(
  db: D1Database,
  profileId: string,
  examGoal: ExamGoal,
) {
  const { results } = await db.prepare(
    `SELECT q.id, q.version, q.exam_goal AS examGoal, q.blueprint_id AS blueprintId,
            q.passage_group AS passageGroup, q.passage_title AS passageTitle,
            q.passage_text AS passageText, q.prompt, q.options_json AS optionsJson,
            q.correct_option AS correctOption, q.explanation_en AS explanationEn
     FROM reading_questions q
     WHERE q.status = 'active' AND q.exam_goal = ?
       AND q.version = (
         SELECT MAX(other.version) FROM reading_questions other
         WHERE other.id = q.id AND other.status = 'active'
       )
       AND NOT EXISTS (
         SELECT 1 FROM practice_attempts a
         WHERE a.profile_id = ? AND a.exam_goal = ? AND a.subject = 'reading'
           AND a.question_id = q.id AND a.question_version = q.version
           AND a.finalized_at IS NOT NULL
       )
     ORDER BY q.passage_group, q.id`,
  ).bind(examGoal, profileId, examGoal).all<ReadingQuestion>();
  return results;
}

function pickReadingQuestions(unused: ReadingQuestion[], mode: PracticeMode) {
  const shuffled = [...unused];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap]!, shuffled[index]!];
  }
  if (mode === "timed") {
    // Short Reading timed set until a full official paper bank exists.
    return shuffled.slice(0, Math.min(SHORT_SET_SIZE, shuffled.length));
  }
  return shuffled.slice(0, Math.min(SHORT_SET_SIZE, shuffled.length));
}

async function learnerProfile(db: D1Database, userId: string) {
  return db.prepare(
    `SELECT p.id, p.exam_goal AS examGoal, p.nickname
     FROM learner_links l JOIN profiles p ON p.id = l.profile_id WHERE l.user_id = ?`,
  ).bind(userId).first<{ id: string; examGoal: ExamGoal; nickname: string }>();
}

async function activeReadingSession(db: D1Database, profileId: string, examGoal: ExamGoal) {
  return db.prepare(
    `SELECT id FROM practice_sessions
     WHERE profile_id = ? AND exam_goal = ? AND subject = 'reading' AND status = 'active'
     ORDER BY started_at DESC LIMIT 1`,
  ).bind(profileId, examGoal).first<{ id: string }>();
}

export async function latestReadingSession(db: D1Database, profileId: string, examGoal: ExamGoal) {
  const active = await activeReadingSession(db, profileId, examGoal);
  if (active) return active;
  return db.prepare(
    `SELECT id FROM practice_sessions
     WHERE profile_id = ? AND exam_goal = ? AND subject = 'reading' AND status = 'completed'
     ORDER BY completed_at DESC, started_at DESC LIMIT 1`,
  ).bind(profileId, examGoal).first<{ id: string }>();
}

export async function startReadingPracticeSession(
  db: D1Database,
  userId: string,
  mode: PracticeMode,
): Promise<{ ok: true; session: PracticeSessionView } | { ok: false; status: number; error: string }> {
  const profile = await learnerProfile(db, userId);
  if (!profile) return { ok: false, status: 403, error: "Link a learner profile before starting practice." };

  const existing = await activeReadingSession(db, profile.id, profile.examGoal);
  if (existing) {
    const session = await getPracticeSession(db, existing.id, userId);
    if (session) return { ok: true, session };
  }

  if (mode === "focus") {
    return {
      ok: false,
      status: 409,
      error: "Reading weak-spot rounds unlock after more Reading practice. Use a short Practice set for now.",
    };
  }

  const unused = await loadUnusedReadingQuestions(db, profile.id, profile.examGoal);
  if (!unused.length) {
    return {
      ok: false,
      status: 409,
      error: "No unused Reading questions yet. Ask your family to generate the Reading practice bank.",
    };
  }

  const questions = pickReadingQuestions(unused, mode);
  const sessionId = createId("psn");
  const startedAt = nowIso();
  const storedMode = mode === "timed" ? "timed" : "daily";

  try {
    await db.batch([
      db.prepare(
        `INSERT INTO practice_sessions (id, profile_id, exam_goal, mode, status, started_at, is_focus, subject)
         VALUES (?, ?, ?, ?, 'active', ?, 0, 'reading')`,
      ).bind(sessionId, profile.id, profile.examGoal, storedMode, startedAt),
      ...questions.map((question, index) => {
        const stamp = new Date(Date.parse(startedAt) + index).toISOString();
        return db.prepare(
          `INSERT INTO practice_attempts
             (id, session_id, profile_id, exam_goal, subject, question_id, question_version,
              question_prompt, options_json, correct_option, explanation_en, created_at)
           VALUES (?, ?, ?, ?, 'reading', ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          createId("pat"),
          sessionId,
          profile.id,
          profile.examGoal,
          question.id,
          question.version,
          combinedPrompt(question),
          question.optionsJson,
          question.correctOption,
          question.explanationEn,
          stamp,
        );
      }),
    ]);
  } catch {
    return { ok: false, status: 503, error: "Could not start Reading practice. Try again." };
  }

  const session = await getPracticeSession(db, sessionId, userId);
  if (!session) return { ok: false, status: 503, error: "Could not load the new Reading session." };
  return { ok: true, session };
}
