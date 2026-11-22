-- Assigned Writing prompts for the learner room (plus marks from 0020).
PRAGMA defer_foreign_keys = ON;

CREATE TABLE learning_evidence_new (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  exam_goal TEXT NOT NULL CHECK (exam_goal IN ('selective', 'oc')),
  subject TEXT NOT NULL DEFAULT 'thinking'
    CHECK (subject IN ('thinking', 'reading', 'mathematics', 'writing')),
  kind TEXT NOT NULL CHECK (kind IN (
    'material_analysis',
    'attempt',
    'parent_feedback',
    'review',
    'reading_practice_pack',
    'reading_remediation',
    'mathematics_practice_pack',
    'writing_mark',
    'writing_prompt'
  )),
  ref_id TEXT NOT NULL,
  summary TEXT NOT NULL CHECK (length(summary) BETWEEN 1 AND 4000),
  created_at TEXT NOT NULL
);
INSERT INTO learning_evidence_new
SELECT id, profile_id, exam_goal, subject, kind, ref_id, summary, created_at
FROM learning_evidence;
DROP TABLE learning_evidence;
ALTER TABLE learning_evidence_new RENAME TO learning_evidence;
CREATE INDEX learning_evidence_scope ON learning_evidence(profile_id, exam_goal, created_at DESC);
CREATE INDEX learning_evidence_subject_scope
  ON learning_evidence(profile_id, exam_goal, subject, created_at DESC);
