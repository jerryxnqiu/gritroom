import type { ExamGoal } from "./family";
import { createId } from "./ids.ts";
import { getPracticeSession, type PracticeMode, type PracticeSessionView } from "./practice.ts";
import { nowIso } from "./time.ts";

const SHORT_SET_SIZE = 10;
const WEAK_BLUEPRINT_LIMIT = 3;

/** Official Mathematical Reasoning timed paper from NSW format guides. */
export function mathematicsTimedPaperSpec(goal: ExamGoal) {
  return {
    questions: 35,
    minutes: 40,
    label: "35-question timed Mathematics paper",
    optionCount: 5,
    examGoal: goal,
  };
}

export type MathematicsQuestion = {
  id: string;
  version: number;
  examGoal: ExamGoal;
  blueprintId: string | null;
  prompt: string;
  optionsJson: string;
  correctOption: string;
  explanationEn: string | null;
  imageKey: string | null;
};

/** Mathematics blueprints this learner misses most often (via bank join — attempts.blueprint_id stays null). */
export async function listWeakMathematicsBlueprintIds(
  db: D1Database,
  profileId: string,
  examGoal: ExamGoal,
  limit = WEAK_BLUEPRINT_LIMIT,
) {
  const { results } = await db.prepare(
    `SELECT q.blueprint_id AS blueprintId, COUNT(*) AS misses
     FROM practice_attempts a
     JOIN mathematics_questions q
       ON q.id = a.question_id AND q.version = a.question_version
     WHERE a.profile_id = ? AND a.exam_goal = ? AND a.subject = 'mathematics'
       AND a.finalized_at IS NOT NULL AND a.is_correct = 0
       AND q.blueprint_id IS NOT NULL
     GROUP BY q.blueprint_id
     ORDER BY misses DESC, q.blueprint_id
     LIMIT ?`,
  ).bind(profileId, examGoal, Math.max(1, limit)).all<{ blueprintId: string; misses: number }>();
  return results.map((row) => row.blueprintId);
}

export async function countUnusedMathematicsQuestions(
  db: D1Database,
  profileId: string,
  examGoal: ExamGoal,
) {
  const unused = await loadUnusedMathematicsQuestions(db, profileId, examGoal);
  return unused.length;
}

export async function countUnusedWeakMathematicsQuestions(
  db: D1Database,
  profileId: string,
  examGoal: ExamGoal,
) {
  const weakIds = await listWeakMathematicsBlueprintIds(db, profileId, examGoal);
  if (!weakIds.length) return 0;
  const unused = await loadUnusedMathematicsQuestions(db, profileId, examGoal, weakIds);
  return unused.length;
}

export async function loadUnusedMathematicsQuestions(
  db: D1Database,
  profileId: string,
  examGoal: ExamGoal,
  blueprintIds?: string[],
) {
  if (blueprintIds && !blueprintIds.length) return [] as MathematicsQuestion[];

  const blueprintClause = blueprintIds?.length
    ? `AND q.blueprint_id IN (${blueprintIds.map(() => "?").join(", ")})`
    : "";
  const binds: Array<string | ExamGoal> = blueprintIds?.length
    ? [examGoal, ...blueprintIds, profileId, examGoal]
    : [examGoal, profileId, examGoal];

  const { results } = await db.prepare(
    `SELECT q.id, q.version, q.exam_goal AS examGoal, q.blueprint_id AS blueprintId,
            q.prompt, q.options_json AS optionsJson, q.correct_option AS correctOption,
            q.explanation_en AS explanationEn, q.image_key AS imageKey
     FROM mathematics_questions q
     WHERE q.status = 'active' AND q.exam_goal = ?
       ${blueprintClause}
       AND q.version = (
         SELECT MAX(other.version) FROM mathematics_questions other
         WHERE other.id = q.id AND other.status = 'active'
       )
       AND NOT EXISTS (
         SELECT 1 FROM practice_attempts a
         WHERE a.profile_id = ? AND a.exam_goal = ? AND a.subject = 'mathematics'
           AND a.question_id = q.id AND a.question_version = q.version
           AND a.finalized_at IS NOT NULL
       )
     ORDER BY q.blueprint_id, q.id`,
  ).bind(...binds).all<MathematicsQuestion>();
  return results;
}

function pickMathematicsQuestions(
  unused: MathematicsQuestion[],
  mode: PracticeMode,
  examGoal: ExamGoal,
) {
  const shuffled = [...unused];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap]!, shuffled[index]!];
  }
  if (mode === "timed") {
    return shuffled.slice(0, mathematicsTimedPaperSpec(examGoal).questions);
  }
  return shuffled.slice(0, Math.min(SHORT_SET_SIZE, shuffled.length));
}

function storedMathematicsSessionMode(mode: PracticeMode) {
  if (mode === "focus") return { mode: "daily" as const, isFocus: 1 };
  if (mode === "timed") return { mode: "timed" as const, isFocus: 0 };
  return { mode: "daily" as const, isFocus: 0 };
}

async function learnerProfile(db: D1Database, userId: string) {
  return db.prepare(
    `SELECT p.id, p.exam_goal AS examGoal, p.nickname
     FROM learner_links l JOIN profiles p ON p.id = l.profile_id WHERE l.user_id = ?`,
  ).bind(userId).first<{ id: string; examGoal: ExamGoal; nickname: string }>();
}

async function activeMathematicsSession(db: D1Database, profileId: string, examGoal: ExamGoal) {
  return db.prepare(
    `SELECT id FROM practice_sessions
     WHERE profile_id = ? AND exam_goal = ? AND subject = 'mathematics' AND status = 'active'
     ORDER BY started_at DESC LIMIT 1`,
  ).bind(profileId, examGoal).first<{ id: string }>();
}

export async function latestMathematicsSession(db: D1Database, profileId: string, examGoal: ExamGoal) {
  const active = await activeMathematicsSession(db, profileId, examGoal);
  if (active) return active;
  return db.prepare(
    `SELECT id FROM practice_sessions
     WHERE profile_id = ? AND exam_goal = ? AND subject = 'mathematics' AND status = 'completed'
     ORDER BY completed_at DESC, started_at DESC LIMIT 1`,
  ).bind(profileId, examGoal).first<{ id: string }>();
}

export async function startMathematicsPracticeSession(
  db: D1Database,
  userId: string,
  mode: PracticeMode,
): Promise<{ ok: true; session: PracticeSessionView } | { ok: false; status: number; error: string }> {
  const profile = await learnerProfile(db, userId);
  if (!profile) return { ok: false, status: 403, error: "Link a learner profile before starting practice." };

  const existing = await activeMathematicsSession(db, profile.id, profile.examGoal);
  if (existing) {
    const session = await getPracticeSession(db, existing.id, userId);
    if (session) return { ok: true, session };
  }

  let blueprintFilter: string[] | undefined;
  if (mode === "focus") {
    const weakIds = await listWeakMathematicsBlueprintIds(db, profile.id, profile.examGoal);
    if (!weakIds.length) {
      return {
        ok: false,
        status: 409,
        error: "Weak-spot practice needs a few incorrect Mathematics answers first. Do a short Practice set, then try again.",
      };
    }
    blueprintFilter = weakIds;
  }

  const unused = await loadUnusedMathematicsQuestions(
    db,
    profile.id,
    profile.examGoal,
    blueprintFilter,
  );
  if (!unused.length) {
    return {
      ok: false,
      status: 409,
      error: mode === "focus"
        ? "No unused questions left for your Mathematics weak spots. Ask your family to refresh the Mathematics bank for those skills."
        : "No unused Mathematics questions yet. Ask your family to generate the Mathematics practice bank.",
    };
  }

  if (mode === "timed") {
    const paper = mathematicsTimedPaperSpec(profile.examGoal);
    if (unused.length < paper.questions) {
      return {
        ok: false,
        status: 409,
        error: `A ${paper.label} needs ${paper.questions} unused questions. ${unused.length} left in the bank — ask your family to refresh, or use Practice for a short set.`,
      };
    }
  }

  const questions = pickMathematicsQuestions(unused, mode, profile.examGoal);
  const sessionId = createId("psn");
  const startedAt = nowIso();
  const stored = storedMathematicsSessionMode(mode);

  try {
    await db.batch([
      db.prepare(
        `INSERT INTO practice_sessions (id, profile_id, exam_goal, mode, status, started_at, is_focus, subject)
         VALUES (?, ?, ?, ?, 'active', ?, ?, 'mathematics')`,
      ).bind(sessionId, profile.id, profile.examGoal, stored.mode, startedAt, stored.isFocus),
      ...questions.map((question, index) => {
        const stamp = new Date(Date.parse(startedAt) + index).toISOString();
        return db.prepare(
          `INSERT INTO practice_attempts
             (id, session_id, profile_id, exam_goal, subject, question_id, question_version,
              question_prompt, options_json, correct_option, explanation_en, image_key, created_at)
           VALUES (?, ?, ?, ?, 'mathematics', ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          createId("pat"),
          sessionId,
          profile.id,
          profile.examGoal,
          question.id,
          question.version,
          question.prompt,
          question.optionsJson,
          question.correctOption,
          question.explanationEn,
          question.imageKey,
          stamp,
        );
      }),
    ]);
  } catch {
    return { ok: false, status: 503, error: "Could not start that Mathematics paper. Try again." };
  }

  const session = await getPracticeSession(db, sessionId, userId);
  if (!session) return { ok: false, status: 503, error: "Session started but could not be reloaded." };
  return { ok: true, session };
}
