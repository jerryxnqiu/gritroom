-- Extracted material findings and practice evidence used for later question generation.
-- Analyses stay as durable evidence even if a material is later removed from the shelf list.

CREATE TABLE material_analyses (
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
  CHECK (
    (status = 'succeeded' AND summary_en IS NOT NULL AND length(summary_en) BETWEEN 1 AND 4000
      AND evidence_limits IS NOT NULL AND completed_at IS NOT NULL AND error IS NULL)
    OR (status = 'failed' AND error IS NOT NULL AND completed_at IS NOT NULL AND summary_en IS NULL)
    OR (status = 'running' AND summary_en IS NULL AND parent_zh IS NULL
      AND training_directions_json IS NULL AND evidence_limits IS NULL AND error IS NULL AND completed_at IS NULL)
  )
);

CREATE INDEX material_analyses_material ON material_analyses(material_id, created_at DESC);
CREATE INDEX material_analyses_scope ON material_analyses(profile_id, exam_goal, created_at DESC)
  WHERE status = 'succeeded';

-- Durable citations for generation / review. Survives shelf cleanup when copied here.
CREATE TABLE learning_evidence (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  exam_goal TEXT NOT NULL CHECK (exam_goal IN ('selective', 'oc')),
  kind TEXT NOT NULL CHECK (kind IN ('material_analysis', 'attempt', 'parent_feedback', 'review')),
  ref_id TEXT NOT NULL,
  summary TEXT NOT NULL CHECK (length(summary) BETWEEN 1 AND 4000),
  created_at TEXT NOT NULL
);

CREATE INDEX learning_evidence_scope ON learning_evidence(profile_id, exam_goal, created_at DESC);

-- Practice flow storage (learner attempts). Question bank wiring comes next.
CREATE TABLE practice_sessions (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  exam_goal TEXT NOT NULL CHECK (exam_goal IN ('selective', 'oc')),
  mode TEXT NOT NULL CHECK (mode IN ('diagnostic', 'daily', 'timed')),
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'abandoned')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  CHECK (
    (status = 'active' AND completed_at IS NULL)
    OR (status IN ('completed', 'abandoned') AND completed_at IS NOT NULL)
  )
);

CREATE INDEX practice_sessions_scope ON practice_sessions(profile_id, exam_goal, started_at DESC);

CREATE TABLE practice_attempts (
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
  CHECK (
    (blueprint_id IS NULL AND blueprint_version IS NULL)
    OR (blueprint_id IS NOT NULL AND blueprint_version IS NOT NULL)
  ),
  CHECK (
    (finalized_at IS NULL AND selected_option IS NULL AND is_correct IS NULL)
    OR (finalized_at IS NOT NULL AND selected_option IS NOT NULL AND is_correct IS NOT NULL)
  ),
  FOREIGN KEY (blueprint_id, blueprint_version) REFERENCES thinking_blueprints(id, version)
);

CREATE INDEX practice_attempts_session ON practice_attempts(session_id, created_at);
CREATE INDEX practice_attempts_scope ON practice_attempts(profile_id, exam_goal, created_at DESC);
