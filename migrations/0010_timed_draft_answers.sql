-- Timed papers need draft answers that can be changed before final submit.
-- Relax practice_attempts so selected_option may be set while finalized_at is still NULL.
-- SQLite cannot ALTER CHECK constraints in place, so rebuild the table.

PRAGMA foreign_keys = OFF;

CREATE TABLE practice_attempts_new (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES practice_sessions(id),
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  exam_goal TEXT NOT NULL CHECK (exam_goal IN ('selective', 'oc')),
  blueprint_id TEXT,
  blueprint_version INTEGER CHECK (blueprint_version IS NULL OR blueprint_version > 0),
  question_prompt TEXT NOT NULL CHECK (length(question_prompt) BETWEEN 1 AND 8000),
  options_json TEXT NOT NULL,
  correct_option TEXT NOT NULL CHECK (length(correct_option) BETWEEN 1 AND 8),
  selected_option TEXT CHECK (selected_option IS NULL OR length(selected_option) BETWEEN 1 AND 8),
  is_correct INTEGER CHECK (is_correct IS NULL OR is_correct IN (0, 1)),
  confidence INTEGER CHECK (confidence IS NULL OR confidence BETWEEN 1 AND 5),
  time_ms INTEGER CHECK (time_ms IS NULL OR time_ms >= 0),
  draft_notes TEXT CHECK (draft_notes IS NULL OR length(draft_notes) <= 8000),
  working_file_key TEXT UNIQUE,
  created_at TEXT NOT NULL,
  finalized_at TEXT,
  question_id TEXT,
  question_version INTEGER CHECK (question_version IS NULL OR question_version > 0),
  image_key TEXT,
  explanation_en TEXT CHECK (explanation_en IS NULL OR length(explanation_en) BETWEEN 1 AND 4000),
  attempt_review_en TEXT CHECK (attempt_review_en IS NULL OR length(attempt_review_en) BETWEEN 1 AND 4000),
  CHECK (
    (blueprint_id IS NULL AND blueprint_version IS NULL)
    OR (blueprint_id IS NOT NULL AND blueprint_version IS NOT NULL)
  ),
  CHECK (
    (finalized_at IS NULL AND is_correct IS NULL)
    OR (finalized_at IS NOT NULL AND is_correct IS NOT NULL)
  ),
  FOREIGN KEY (blueprint_id, blueprint_version) REFERENCES thinking_blueprints(id, version)
);

INSERT INTO practice_attempts_new (
  id, session_id, profile_id, exam_goal, blueprint_id, blueprint_version,
  question_prompt, options_json, correct_option, selected_option, is_correct,
  confidence, time_ms, draft_notes, working_file_key, created_at, finalized_at,
  question_id, question_version, image_key, explanation_en, attempt_review_en
)
SELECT
  id, session_id, profile_id, exam_goal, blueprint_id, blueprint_version,
  question_prompt, options_json, correct_option, selected_option, is_correct,
  confidence, time_ms, draft_notes, working_file_key, created_at, finalized_at,
  question_id, question_version, image_key, explanation_en, attempt_review_en
FROM practice_attempts;

DROP TABLE practice_attempts;
ALTER TABLE practice_attempts_new RENAME TO practice_attempts;

CREATE INDEX practice_attempts_session ON practice_attempts(session_id, created_at);
CREATE INDEX practice_attempts_scope ON practice_attempts(profile_id, exam_goal, created_at DESC);

PRAGMA foreign_keys = ON;
