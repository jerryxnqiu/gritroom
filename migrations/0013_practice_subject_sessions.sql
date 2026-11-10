-- Subject tags on the live practice bank and attempts (after 0012 shelf subjects).

ALTER TABLE practice_sessions ADD COLUMN subject TEXT NOT NULL DEFAULT 'thinking'
  CHECK (subject IN ('thinking', 'reading'));

ALTER TABLE practice_attempts ADD COLUMN subject TEXT NOT NULL DEFAULT 'thinking'
  CHECK (subject IN ('thinking', 'reading'));

ALTER TABLE practice_questions ADD COLUMN subject TEXT NOT NULL DEFAULT 'thinking'
  CHECK (subject IN ('thinking', 'reading'));

CREATE INDEX IF NOT EXISTS practice_sessions_subject_scope
  ON practice_sessions(profile_id, exam_goal, subject, started_at DESC);

CREATE INDEX IF NOT EXISTS practice_attempts_subject_scope
  ON practice_attempts(profile_id, exam_goal, subject, created_at DESC);

CREATE INDEX IF NOT EXISTS practice_questions_subject_active
  ON practice_questions(subject, status, blueprint_id, id);
