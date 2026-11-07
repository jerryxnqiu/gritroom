CREATE TABLE shelf_materials (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  exam_goal TEXT NOT NULL CHECK (exam_goal IN ('selective', 'oc')),
  kind TEXT NOT NULL CHECK (kind IN ('coaching_report', 'coaching_video', 'study_material')),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 140),
  source_url TEXT,
  notes TEXT,
  file_key TEXT UNIQUE,
  file_name TEXT,
  file_type TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  CHECK (source_url IS NOT NULL OR notes IS NOT NULL OR file_key IS NOT NULL),
  CHECK (
    (file_key IS NULL AND file_name IS NULL AND file_type IS NULL)
    OR (file_key IS NOT NULL AND file_name IS NOT NULL AND file_type IS NOT NULL)
  )
);

CREATE INDEX shelf_materials_scope ON shelf_materials(profile_id, exam_goal, created_at DESC);

CREATE TABLE shelf_feedback (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  exam_goal TEXT NOT NULL CHECK (exam_goal IN ('selective', 'oc')),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  withdrawn_at TEXT
);

CREATE INDEX shelf_feedback_scope ON shelf_feedback(profile_id, exam_goal, created_at DESC) WHERE withdrawn_at IS NULL;
