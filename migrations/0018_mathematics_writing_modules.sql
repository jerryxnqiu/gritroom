-- Add Mathematics + Writing practice modules (widen subject CHECKs, seed knowledge, Math bank table).
-- D1 ignores PRAGMA foreign_keys=OFF; drop dependents before parents; defer checks for the swap.

PRAGMA defer_foreign_keys = ON;

-- ---- Widen subject CHECKs (SQLite cannot ALTER CHECK in place) ----

CREATE TABLE shelf_materials_new (
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

-- Restore FK after rename (SQLite stores the name; recreate table with REFERENCES).
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

CREATE TABLE shelf_feedback_new (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  exam_goal TEXT NOT NULL CHECK (exam_goal IN ('selective', 'oc')),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  withdrawn_at TEXT,
  subject TEXT NOT NULL DEFAULT 'thinking'
    CHECK (subject IN ('thinking', 'reading', 'mathematics', 'writing'))
);
INSERT INTO shelf_feedback_new
SELECT id, profile_id, exam_goal, body, created_by_user_id, created_at, withdrawn_at, subject
FROM shelf_feedback;
DROP TABLE shelf_feedback;
ALTER TABLE shelf_feedback_new RENAME TO shelf_feedback;
CREATE INDEX shelf_feedback_scope ON shelf_feedback(profile_id, exam_goal, created_at DESC) WHERE withdrawn_at IS NULL;
CREATE INDEX shelf_feedback_subject_scope ON shelf_feedback(profile_id, exam_goal, subject, created_at DESC)
  WHERE withdrawn_at IS NULL;

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
    'mathematics_practice_pack'
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

CREATE TABLE practice_sessions_new (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  exam_goal TEXT NOT NULL CHECK (exam_goal IN ('selective', 'oc')),
  mode TEXT NOT NULL CHECK (mode IN ('diagnostic', 'daily', 'timed')),
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'abandoned')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  is_focus INTEGER NOT NULL DEFAULT 0 CHECK (is_focus IN (0, 1)),
  subject TEXT NOT NULL DEFAULT 'thinking'
    CHECK (subject IN ('thinking', 'reading', 'mathematics', 'writing')),
  CHECK (
    (status = 'active' AND completed_at IS NULL)
    OR (status IN ('completed', 'abandoned') AND completed_at IS NOT NULL)
  )
);
INSERT INTO practice_sessions_new
SELECT id, profile_id, exam_goal, mode, status, started_at, completed_at, is_focus, subject
FROM practice_sessions;

CREATE TABLE practice_attempts_new (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
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
  subject TEXT NOT NULL DEFAULT 'thinking'
    CHECK (subject IN ('thinking', 'reading', 'mathematics', 'writing')),
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
  question_id, question_version, image_key, explanation_en, attempt_review_en, subject
)
SELECT
  id, session_id, profile_id, exam_goal, blueprint_id, blueprint_version,
  question_prompt, options_json, correct_option, selected_option, is_correct,
  confidence, time_ms, draft_notes, working_file_key, created_at, finalized_at,
  question_id, question_version, image_key, explanation_en, attempt_review_en, subject
FROM practice_attempts;

DROP TABLE practice_attempts;
DROP TABLE practice_sessions;
ALTER TABLE practice_sessions_new RENAME TO practice_sessions;
ALTER TABLE practice_attempts_new RENAME TO practice_attempts;

CREATE TABLE practice_attempts_fk (
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
  subject TEXT NOT NULL DEFAULT 'thinking'
    CHECK (subject IN ('thinking', 'reading', 'mathematics', 'writing')),
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
INSERT INTO practice_attempts_fk
SELECT * FROM practice_attempts;
DROP TABLE practice_attempts;
ALTER TABLE practice_attempts_fk RENAME TO practice_attempts;

CREATE INDEX practice_sessions_subject_scope
  ON practice_sessions(profile_id, exam_goal, subject, started_at DESC);
CREATE INDEX practice_attempts_session ON practice_attempts(session_id, created_at);
CREATE INDEX practice_attempts_scope ON practice_attempts(profile_id, exam_goal, created_at DESC);
CREATE INDEX practice_attempts_subject_scope
  ON practice_attempts(profile_id, exam_goal, subject, created_at DESC);

CREATE TABLE practice_questions_new (
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  blueprint_id TEXT NOT NULL,
  blueprint_version INTEGER NOT NULL CHECK (blueprint_version > 0),
  prompt TEXT NOT NULL CHECK (length(prompt) BETWEEN 1 AND 8000),
  options_json TEXT NOT NULL,
  correct_option TEXT NOT NULL CHECK (length(correct_option) BETWEEN 1 AND 8),
  image_key TEXT UNIQUE,
  image_name TEXT,
  image_type TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  created_at TEXT NOT NULL,
  explanation_en TEXT CHECK (explanation_en IS NULL OR length(explanation_en) BETWEEN 1 AND 4000),
  subject TEXT NOT NULL DEFAULT 'thinking'
    CHECK (subject IN ('thinking', 'reading', 'mathematics', 'writing')),
  PRIMARY KEY (id, version),
  FOREIGN KEY (blueprint_id, blueprint_version) REFERENCES thinking_blueprints(id, version),
  CHECK (
    (image_key IS NULL AND image_name IS NULL AND image_type IS NULL)
    OR (image_key IS NOT NULL AND image_name IS NOT NULL AND image_type IS NOT NULL)
  )
);
INSERT INTO practice_questions_new
SELECT id, version, blueprint_id, blueprint_version, prompt, options_json, correct_option,
  image_key, image_name, image_type, status, created_at, explanation_en, subject
FROM practice_questions;
DROP TABLE practice_questions;
ALTER TABLE practice_questions_new RENAME TO practice_questions;
CREATE INDEX practice_questions_active ON practice_questions(status, blueprint_id, id);
CREATE INDEX practice_questions_subject_active
  ON practice_questions(subject, status, blueprint_id, id);

-- ---- Mathematics knowledge + bank ----

CREATE TABLE mathematics_sources (
  id TEXT PRIMARY KEY,
  exam_goal TEXT NOT NULL CHECK (exam_goal IN ('selective', 'oc')),
  kind TEXT NOT NULL CHECK (kind IN ('format', 'worked_examples')),
  label TEXT NOT NULL,
  url TEXT NOT NULL CHECK (url LIKE 'https://education.nsw.gov.au/%'),
  checked_on TEXT NOT NULL,
  question_count INTEGER,
  minutes INTEGER,
  option_count INTEGER,
  notes TEXT,
  CHECK (
    (kind = 'format' AND question_count IS NOT NULL AND question_count > 0
      AND minutes IS NOT NULL AND minutes > 0 AND option_count IS NOT NULL AND option_count > 1)
    OR (kind = 'worked_examples' AND question_count IS NULL AND minutes IS NULL AND option_count IS NULL)
  )
);

CREATE UNIQUE INDEX mathematics_sources_format ON mathematics_sources(exam_goal) WHERE kind = 'format';

CREATE TABLE mathematics_blueprints (
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  skill TEXT NOT NULL,
  title TEXT NOT NULL,
  method TEXT NOT NULL,
  authoring_rule TEXT NOT NULL,
  verification_rule TEXT NOT NULL,
  PRIMARY KEY (id, version)
);

CREATE TABLE mathematics_blueprint_references (
  blueprint_id TEXT NOT NULL,
  blueprint_version INTEGER NOT NULL,
  source_id TEXT NOT NULL REFERENCES mathematics_sources(id),
  note TEXT NOT NULL,
  PRIMARY KEY (blueprint_id, blueprint_version, source_id, note),
  FOREIGN KEY (blueprint_id, blueprint_version) REFERENCES mathematics_blueprints(id, version)
);

INSERT INTO mathematics_sources
  (id, exam_goal, kind, label, url, checked_on, question_count, minutes, option_count, notes)
VALUES
  ('nsw-selective-maths-guide', 'selective', 'format', 'NSW Selective Mathematical Reasoning format',
   'https://education.nsw.gov.au/schooling/students/oc-and-shs/going-to-a-selective-high-school/get-ready-for-the-selective-high-school-placement-test',
   '2026-11-17', 35, 40, 5,
   '35 multiple-choice questions with five options (A–E). No calculator; paper working allowed.'),
  ('nsw-oc-maths-guide', 'oc', 'format', 'NSW Opportunity Class Mathematical Reasoning format',
   'https://education.nsw.gov.au/schooling/students/oc-and-shs/going-to-an-opportunity-class/get-ready-for-the-opportunity-class-placement-test',
   '2026-11-17', 35, 40, 5,
   '35 multiple-choice questions with five options (A–E). No calculator; paper working allowed.'),
  ('nsw-selective-maths-pt1', 'selective', 'worked_examples', 'NSW Selective Mathematical Reasoning practice test 1',
   'https://education.nsw.gov.au/content/dam/main-education/schooling/parents-and-carers/choosing-a-school-setting/selective-high-schools-and-opportunity-classes-parents/documents/shs-practice-tests-2026-entry/PT1_SHS_maths_questions_Final.pdf',
   '2026-11-17', NULL, NULL, NULL, NULL),
  ('nsw-oc-maths-pt1', 'oc', 'worked_examples', 'NSW OC Mathematical Reasoning practice test 1',
   'https://education.nsw.gov.au/content/dam/main-education/schooling/parents-and-carers/choosing-a-school-setting/selective-high-schools-and-opportunity-classes-parents/documents/oc-practice-tests-2026-entry/PT1_OC_maths_questions.pdf',
   '2026-11-17', NULL, NULL, NULL, NULL);

INSERT INTO mathematics_blueprints (id, version, skill, title, method, authoring_rule, verification_rule) VALUES
  ('number-sense', 1, 'Number', 'Place value, operations and estimation',
   'Restate what is asked. Estimate before exact calculation; check units and order of operations.',
   'Write an original number problem with five options. Prefer reasoning over heavy arithmetic.',
   'Work the solution two ways and show why each distractor fails (wrong operation, place-value slip, or estimate trap).'),
  ('fractions-ratio', 1, 'Fractions & ratio', 'Parts, wholes and proportional change',
   'Name the whole. Convert to a common form before comparing or combining.',
   'Use an original fraction/ratio context. Include one distractor from adding denominators or mixing parts.',
   'Show the equivalent forms and verify only one option matches the finished model.'),
  ('measurement-space', 1, 'Measurement & space', 'Length, area, volume and diagrams',
   'Mark given lengths on a sketch. Decide which formula or relation actually applies.',
   'Provide a clear diagram description (or ASCII sketch) and five options. Avoid needing a calculator.',
   'Compute with labelled lengths and reject options that use the wrong dimension.'),
  ('patterns-algebra', 1, 'Patterns & algebra', 'Rules, sequences and unknowns',
   'Write the rule in words, then test it on the next term or unknown.',
   'Invent a short pattern or simple equation story. Options should look plausible after one wrong step.',
   'Substitute back into the rule and show the unique fit.'),
  ('data-chance', 1, 'Data & chance', 'Tables, graphs and likely outcomes',
   'Read the chart axes or sample space carefully before choosing.',
   'Use an original table or chance context. Include a distractor that reads the wrong row/column.',
   'Point to the exact cell or probability model that justifies the key.');

INSERT INTO mathematics_blueprint_references (blueprint_id, blueprint_version, source_id, note) VALUES
  ('number-sense', 1, 'nsw-selective-maths-pt1', 'Number / operations style items'),
  ('fractions-ratio', 1, 'nsw-selective-maths-pt1', 'Fraction and ratio reasoning items'),
  ('measurement-space', 1, 'nsw-selective-maths-pt1', 'Measurement and spatial items'),
  ('patterns-algebra', 1, 'nsw-selective-maths-pt1', 'Pattern and unknown items'),
  ('data-chance', 1, 'nsw-selective-maths-pt1', 'Data and chance items'),
  ('number-sense', 1, 'nsw-oc-maths-pt1', 'Number / operations style items'),
  ('fractions-ratio', 1, 'nsw-oc-maths-pt1', 'Fraction and ratio reasoning items'),
  ('measurement-space', 1, 'nsw-oc-maths-pt1', 'Measurement and spatial items'),
  ('patterns-algebra', 1, 'nsw-oc-maths-pt1', 'Pattern and unknown items'),
  ('data-chance', 1, 'nsw-oc-maths-pt1', 'Data and chance items');

CREATE TABLE mathematics_questions (
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  exam_goal TEXT NOT NULL CHECK (exam_goal IN ('selective', 'oc')),
  blueprint_id TEXT,
  prompt TEXT NOT NULL CHECK (length(prompt) BETWEEN 1 AND 4000),
  options_json TEXT NOT NULL,
  correct_option TEXT NOT NULL CHECK (length(correct_option) BETWEEN 1 AND 8),
  explanation_en TEXT CHECK (explanation_en IS NULL OR length(explanation_en) BETWEEN 1 AND 4000),
  image_key TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (id, version)
);

CREATE INDEX mathematics_questions_active
  ON mathematics_questions(exam_goal, status, id);

CREATE INDEX mathematics_questions_blueprint
  ON mathematics_questions(blueprint_id, status, id);

-- ---- Writing knowledge (open response; no MCQ bank) ----

CREATE TABLE writing_sources (
  id TEXT PRIMARY KEY,
  exam_goal TEXT NOT NULL CHECK (exam_goal IN ('selective', 'oc')),
  kind TEXT NOT NULL CHECK (kind IN ('format', 'worked_examples')),
  label TEXT NOT NULL,
  url TEXT NOT NULL CHECK (url LIKE 'https://education.nsw.gov.au/%'),
  checked_on TEXT NOT NULL,
  question_count INTEGER,
  minutes INTEGER,
  notes TEXT,
  CHECK (
    (kind = 'format' AND question_count IS NOT NULL AND question_count > 0
      AND minutes IS NOT NULL AND minutes > 0)
    OR (kind = 'worked_examples' AND question_count IS NULL AND minutes IS NULL)
  )
);

CREATE UNIQUE INDEX writing_sources_format ON writing_sources(exam_goal) WHERE kind = 'format';

CREATE TABLE writing_blueprints (
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  skill TEXT NOT NULL,
  title TEXT NOT NULL,
  method TEXT NOT NULL,
  authoring_rule TEXT NOT NULL,
  verification_rule TEXT NOT NULL,
  PRIMARY KEY (id, version)
);

CREATE TABLE writing_blueprint_references (
  blueprint_id TEXT NOT NULL,
  blueprint_version INTEGER NOT NULL,
  source_id TEXT NOT NULL REFERENCES writing_sources(id),
  note TEXT NOT NULL,
  PRIMARY KEY (blueprint_id, blueprint_version, source_id, note),
  FOREIGN KEY (blueprint_id, blueprint_version) REFERENCES writing_blueprints(id, version)
);

-- Selective has Writing; OC placement test does not. Seed Selective format + a placeholder OC note row omitted.
INSERT INTO writing_sources
  (id, exam_goal, kind, label, url, checked_on, question_count, minutes, notes)
VALUES
  ('nsw-selective-writing-guide', 'selective', 'format', 'NSW Selective Writing format',
   'https://education.nsw.gov.au/schooling/students/oc-and-shs/going-to-a-selective-high-school/get-ready-for-the-selective-high-school-placement-test',
   '2026-11-17', 1, 30,
   'One open-response task typed on screen in 30 minutes. Marked for content and style against a published rubric.'),
  ('nsw-selective-writing-pt1', 'selective', 'worked_examples', 'NSW Selective Writing practice test 1',
   'https://education.nsw.gov.au/content/dam/main-education/schooling/parents-and-carers/choosing-a-school-setting/selective-high-schools-and-opportunity-classes-parents/documents/shs-practice-tests-2026-entry/PT1_SHS_writing_questions.pdf',
   '2026-11-17', NULL, NULL, NULL);

INSERT INTO writing_blueprints (id, version, skill, title, method, authoring_rule, verification_rule) VALUES
  ('task-response', 1, 'Task response', 'Answer the prompt fully',
   'Underline the audience, purpose and form. Plan three points before writing.',
   'Write an original Selective-style prompt with a clear audience and purpose.',
   'Check that a strong response must address every part of the brief.'),
  ('organisation', 1, 'Organisation', 'Clear structure and paragraphing',
   'Open with purpose, develop with linked paragraphs, finish with a crisp close.',
   'Prefer prompts that reward organised development over a list of facts.',
   'A high-scoring sample should show deliberate paragraph roles.'),
  ('language-control', 1, 'Language', 'Precise vocabulary and control',
   'Choose exact words; vary sentence openings; keep tense and person consistent.',
   'Avoid prompts that invite copied memorised essays with no link to the brief.',
   'Marking notes should reward control and originality, not length alone.');

INSERT INTO writing_blueprint_references (blueprint_id, blueprint_version, source_id, note) VALUES
  ('task-response', 1, 'nsw-selective-writing-pt1', 'Open-response prompt style'),
  ('organisation', 1, 'nsw-selective-writing-pt1', 'Structure expectations'),
  ('language-control', 1, 'nsw-selective-writing-pt1', 'Language and style expectations');
