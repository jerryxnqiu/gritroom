-- Practice modules: Thinking Skills (existing) and Reading (parent-room first).
-- Existing rows default to thinking so Selective/OC archives keep current behaviour.
-- Shelf / analysis / evidence first (usable without the practice bank tables).

ALTER TABLE shelf_materials ADD COLUMN subject TEXT NOT NULL DEFAULT 'thinking'
  CHECK (subject IN ('thinking', 'reading'));

ALTER TABLE shelf_feedback ADD COLUMN subject TEXT NOT NULL DEFAULT 'thinking'
  CHECK (subject IN ('thinking', 'reading'));

ALTER TABLE material_analyses ADD COLUMN subject TEXT NOT NULL DEFAULT 'thinking'
  CHECK (subject IN ('thinking', 'reading'));

ALTER TABLE learning_evidence ADD COLUMN subject TEXT NOT NULL DEFAULT 'thinking'
  CHECK (subject IN ('thinking', 'reading'));

CREATE INDEX IF NOT EXISTS shelf_materials_subject_scope
  ON shelf_materials(profile_id, exam_goal, subject, created_at DESC);

CREATE INDEX IF NOT EXISTS shelf_feedback_subject_scope
  ON shelf_feedback(profile_id, exam_goal, subject, created_at DESC)
  WHERE withdrawn_at IS NULL;

CREATE INDEX IF NOT EXISTS material_analyses_subject_scope
  ON material_analyses(profile_id, exam_goal, subject, created_at DESC);

CREATE INDEX IF NOT EXISTS learning_evidence_subject_scope
  ON learning_evidence(profile_id, exam_goal, subject, created_at DESC);
