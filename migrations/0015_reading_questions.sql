-- Original Reading practice bank (separate from Thinking Skills practice_questions).
-- Attempts reuse practice_sessions / practice_attempts with subject = 'reading'
-- and snapshot the passage+stem into question_prompt (blueprint_id left null).

CREATE TABLE reading_questions (
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  exam_goal TEXT NOT NULL CHECK (exam_goal IN ('selective', 'oc')),
  blueprint_id TEXT,
  passage_group TEXT NOT NULL,
  passage_title TEXT NOT NULL CHECK (length(passage_title) BETWEEN 1 AND 200),
  passage_text TEXT NOT NULL CHECK (length(passage_text) BETWEEN 1 AND 12000),
  prompt TEXT NOT NULL CHECK (length(prompt) BETWEEN 1 AND 4000),
  options_json TEXT NOT NULL,
  correct_option TEXT NOT NULL CHECK (length(correct_option) BETWEEN 1 AND 8),
  explanation_en TEXT CHECK (explanation_en IS NULL OR length(explanation_en) BETWEEN 1 AND 4000),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (id, version)
);

CREATE INDEX reading_questions_active
  ON reading_questions(exam_goal, status, passage_group, id);

CREATE INDEX reading_questions_blueprint
  ON reading_questions(blueprint_id, status, id);
