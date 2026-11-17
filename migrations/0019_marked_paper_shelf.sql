-- Add marked_paper shelf kind for government/sample papers marked at home.
-- SQLite cannot ALTER CHECK in place; rebuild shelf_materials (+ analyses FK).

PRAGMA defer_foreign_keys = ON;

CREATE TABLE shelf_materials_new (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  exam_goal TEXT NOT NULL CHECK (exam_goal IN ('selective', 'oc')),
  kind TEXT NOT NULL CHECK (kind IN ('coaching_report', 'coaching_video', 'study_material', 'marked_paper')),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 140),
  source_url TEXT,
  notes TEXT,
  file_key TEXT UNIQUE,
  file_name TEXT,
  file_type TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT 'thinking'
    CHECK (subject IN ('thinking', 'reading', 'mathematics', 'writing')),
  CHECK (source_url IS NOT NULL OR notes IS NOT NULL OR file_key IS NOT NULL),
  CHECK (
    (file_key IS NULL AND file_name IS NULL AND file_type IS NULL)
    OR (file_key IS NOT NULL AND file_name IS NOT NULL AND file_type IS NOT NULL)
  )
);
INSERT INTO shelf_materials_new
SELECT id, profile_id, exam_goal, kind, title, source_url, notes, file_key, file_name, file_type,
  created_by_user_id, created_at, subject
FROM shelf_materials;

CREATE TABLE material_analyses_new (
  id TEXT PRIMARY KEY,
  material_id TEXT NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  exam_goal TEXT NOT NULL CHECK (exam_goal IN ('selective', 'oc')),
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  summary_en TEXT,
  parent_zh TEXT,
  training_directions_json TEXT,
  evidence_limits TEXT,
  source_excerpt TEXT NOT NULL CHECK (length(source_excerpt) BETWEEN 1 AND 8000),
  model TEXT,
  error TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  completed_at TEXT,
  subject TEXT NOT NULL DEFAULT 'thinking'
    CHECK (subject IN ('thinking', 'reading', 'mathematics', 'writing')),
  CHECK (
    (status = 'succeeded' AND summary_en IS NOT NULL AND length(summary_en) BETWEEN 1 AND 4000
      AND evidence_limits IS NOT NULL AND completed_at IS NOT NULL AND error IS NULL)
    OR (status = 'failed' AND error IS NOT NULL AND completed_at IS NOT NULL AND summary_en IS NULL)
    OR (status = 'running' AND summary_en IS NULL AND parent_zh IS NULL
      AND training_directions_json IS NULL AND evidence_limits IS NULL AND error IS NULL AND completed_at IS NULL)
  )
);
INSERT INTO material_analyses_new
SELECT id, material_id, profile_id, exam_goal, status, summary_en, parent_zh, training_directions_json,
  evidence_limits, source_excerpt, model, error, created_by_user_id, created_at, completed_at, subject
FROM material_analyses;

DROP TABLE material_analyses;
DROP TABLE shelf_materials;
ALTER TABLE shelf_materials_new RENAME TO shelf_materials;
ALTER TABLE material_analyses_new RENAME TO material_analyses;

CREATE INDEX shelf_materials_scope ON shelf_materials(profile_id, exam_goal, created_at DESC);
CREATE INDEX shelf_materials_subject_scope ON shelf_materials(profile_id, exam_goal, subject, created_at DESC);
CREATE INDEX material_analyses_material ON material_analyses(material_id, created_at DESC);
CREATE INDEX material_analyses_scope ON material_analyses(profile_id, exam_goal, created_at DESC)
  WHERE status = 'succeeded';
CREATE INDEX material_analyses_subject_scope ON material_analyses(profile_id, exam_goal, subject, created_at DESC);

CREATE TABLE material_analyses_fk (
  id TEXT PRIMARY KEY,
  material_id TEXT NOT NULL REFERENCES shelf_materials(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  exam_goal TEXT NOT NULL CHECK (exam_goal IN ('selective', 'oc')),
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  summary_en TEXT,
  parent_zh TEXT,
  training_directions_json TEXT,
  evidence_limits TEXT,
  source_excerpt TEXT NOT NULL CHECK (length(source_excerpt) BETWEEN 1 AND 8000),
  model TEXT,
  error TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  completed_at TEXT,
  subject TEXT NOT NULL DEFAULT 'thinking'
    CHECK (subject IN ('thinking', 'reading', 'mathematics', 'writing')),
  CHECK (
    (status = 'succeeded' AND summary_en IS NOT NULL AND length(summary_en) BETWEEN 1 AND 4000
      AND evidence_limits IS NOT NULL AND completed_at IS NOT NULL AND error IS NULL)
    OR (status = 'failed' AND error IS NOT NULL AND completed_at IS NOT NULL AND summary_en IS NULL)
    OR (status = 'running' AND summary_en IS NULL AND parent_zh IS NULL
      AND training_directions_json IS NULL AND evidence_limits IS NULL AND error IS NULL AND completed_at IS NULL)
  )
);
INSERT INTO material_analyses_fk
SELECT id, material_id, profile_id, exam_goal, status, summary_en, parent_zh, training_directions_json,
  evidence_limits, source_excerpt, model, error, created_by_user_id, created_at, completed_at, subject
FROM material_analyses;
DROP TABLE material_analyses;
ALTER TABLE material_analyses_fk RENAME TO material_analyses;
CREATE INDEX material_analyses_material ON material_analyses(material_id, created_at DESC);
CREATE INDEX material_analyses_scope ON material_analyses(profile_id, exam_goal, created_at DESC)
  WHERE status = 'succeeded';
CREATE INDEX material_analyses_subject_scope ON material_analyses(profile_id, exam_goal, subject, created_at DESC);
