-- Public evidence for authoring original Reading practice.
-- Official sample passages stay at the NSW source URLs; we store format + editorial methods only.

CREATE TABLE reading_sources (
  id TEXT PRIMARY KEY,
  exam_goal TEXT NOT NULL CHECK (exam_goal IN ('selective', 'oc')),
  kind TEXT NOT NULL CHECK (kind IN ('format', 'worked_examples')),
  label TEXT NOT NULL,
  url TEXT NOT NULL CHECK (url LIKE 'https://education.nsw.gov.au/%'),
  checked_on TEXT NOT NULL,
  question_count INTEGER,
  answer_count INTEGER,
  minutes INTEGER,
  option_count INTEGER,
  notes TEXT,
  CHECK (
    (kind = 'format' AND question_count IS NOT NULL AND question_count > 0
      AND answer_count IS NOT NULL AND answer_count > 0
      AND minutes IS NOT NULL AND minutes > 0 AND option_count IS NOT NULL AND option_count > 1)
    OR (kind = 'worked_examples' AND question_count IS NULL AND answer_count IS NULL
      AND minutes IS NULL AND option_count IS NULL)
  )
);

CREATE UNIQUE INDEX reading_sources_format ON reading_sources(exam_goal) WHERE kind = 'format';

CREATE TABLE reading_blueprints (
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  skill TEXT NOT NULL,
  title TEXT NOT NULL,
  method TEXT NOT NULL,
  authoring_rule TEXT NOT NULL,
  verification_rule TEXT NOT NULL,
  PRIMARY KEY (id, version)
);

CREATE TABLE reading_blueprint_references (
  blueprint_id TEXT NOT NULL,
  blueprint_version INTEGER NOT NULL,
  source_id TEXT NOT NULL REFERENCES reading_sources(id),
  note TEXT NOT NULL,
  PRIMARY KEY (blueprint_id, blueprint_version, source_id, note),
  FOREIGN KEY (blueprint_id, blueprint_version) REFERENCES reading_blueprints(id, version)
);

INSERT INTO reading_sources
  (id, exam_goal, kind, label, url, checked_on, question_count, answer_count, minutes, option_count, notes)
VALUES
  ('nsw-selective-reading-guide', 'selective', 'format', 'NSW Selective Reading format',
   'https://education.nsw.gov.au/schooling/students/oc-and-shs/going-to-a-selective-high-school/get-ready-for-the-selective-high-school-placement-test',
   '2026-11-12', 17, 38, 45, 4,
   '17 on-screen questions producing 38 multiple-choice answers. Texts are read on screen across fiction, vocabulary cloze, poetry, gapped text and multiple matching.'),
  ('nsw-oc-reading-guide', 'oc', 'format', 'NSW Opportunity Class Reading format',
   'https://education.nsw.gov.au/schooling/students/oc-and-shs/going-to-an-opportunity-class/get-ready-for-the-opportunity-class-placement-test',
   '2026-11-12', 14, 33, 40, 4,
   '14 on-screen questions producing 33 multiple-choice answers across a shorter Reading paper.'),
  ('nsw-selective-reading-pt1', 'selective', 'worked_examples', 'NSW Selective Reading practice test 1',
   'https://education.nsw.gov.au/content/dam/main-education/schooling/parents-and-carers/choosing-a-school-setting/selective-high-schools-and-opportunity-classes-parents/documents/shs-practice-tests-2026-entry/PT1_SHS_reading_questions.pdf',
   '2026-11-12', NULL, NULL, NULL, NULL, NULL),
  ('nsw-oc-reading-pt1', 'oc', 'worked_examples', 'NSW OC Reading practice test 1',
   'https://education.nsw.gov.au/content/dam/main-education/schooling/parents-and-carers/choosing-a-school-setting/selective-high-schools-and-opportunity-classes-parents/documents/oc-practice-tests-2026-entry/PT1_OC_reading_questions.pdf',
   '2026-11-12', NULL, NULL, NULL, NULL, NULL);

INSERT INTO reading_blueprints (id, version, skill, title, method, authoring_rule, verification_rule) VALUES
  ('fiction-comprehension', 1, 'Fiction', 'Detail, inference and tone in prose',
   'Locate the claim in the passage, then test whether each option is stated, implied or unsupported.',
   'Write an original short fiction extract. Ask one precise comprehension or inference question with four options.',
   'Mark the supporting sentence or implication for the key. Reject options that need outside knowledge.'),
  ('vocabulary-cloze', 1, 'Vocabulary', 'Choose the precise word for a gap',
   'Read the full sentence and neighbouring lines. Prefer collocation and exact meaning over a near synonym.',
   'Write an original short paragraph with one blank. Offer four vocabulary options that are close but only one fits.',
   'Check that substituting each distractor changes sense, register or grammar unacceptably.'),
  ('poetry-meaning', 1, 'Poetry', 'Imagery and implied meaning',
   'Track figurative language and speaker attitude before choosing an option.',
   'Use an original short poem. Ask about image, mood or implied meaning — not trivia about the poet.',
   'Point to the lines that justify the key and show why literal distractors fail.'),
  ('gapped-cohesion', 1, 'Text structure', 'Restore removed extracts by cohesion',
   'Use pronouns, topic links and logical order to place each extract; leave the decoy unused.',
   'Write an original informative text with six gaps and seven short extracts (one unused).',
   'Verify each placement against local cohesion and that the leftover extract does not fit any gap cleanly.'),
  ('multiple-matching', 1, 'Compare texts', 'Match statements to short texts',
   'Read each statement, then scan the short texts for the unique supporting extract.',
   'Write four short original extracts and ten statements that each match one extract; reuse labels as needed.',
   'Confirm each statement is supported by exactly one intended extract and not by a plausible rival.');

INSERT INTO reading_blueprint_references (blueprint_id, blueprint_version, source_id, note) VALUES
  ('fiction-comprehension', 1, 'nsw-selective-reading-pt1', 'Style cue · fiction / prose comprehension block'),
  ('vocabulary-cloze', 1, 'nsw-selective-reading-pt1', 'Style cue · vocabulary cloze block'),
  ('poetry-meaning', 1, 'nsw-selective-reading-pt1', 'Style cue · poetry block'),
  ('gapped-cohesion', 1, 'nsw-selective-reading-pt1', 'Style cue · gapped-text cohesion block'),
  ('multiple-matching', 1, 'nsw-selective-reading-pt1', 'Style cue · multiple-matching block'),
  ('fiction-comprehension', 1, 'nsw-oc-reading-pt1', 'Style cue · OC Reading practice paper'),
  ('vocabulary-cloze', 1, 'nsw-oc-reading-pt1', 'Style cue · OC Reading practice paper'),
  ('poetry-meaning', 1, 'nsw-oc-reading-pt1', 'Style cue · OC Reading practice paper'),
  ('gapped-cohesion', 1, 'nsw-oc-reading-pt1', 'Style cue · OC Reading practice paper'),
  ('multiple-matching', 1, 'nsw-oc-reading-pt1', 'Style cue · OC Reading practice paper');
