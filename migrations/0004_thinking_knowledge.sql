-- Public evidence for authoring original Thinking Skills practice.
-- Store references and editorial methods. Official sample items remain at the source.
CREATE TABLE thinking_sources (
  id TEXT PRIMARY KEY,
  exam_goal TEXT NOT NULL CHECK (exam_goal IN ('selective', 'oc')),
  kind TEXT NOT NULL CHECK (kind IN ('format', 'worked_examples')),
  label TEXT NOT NULL,
  url TEXT NOT NULL CHECK (url LIKE 'https://education.nsw.gov.au/%'),
  checked_on TEXT NOT NULL,
  question_count INTEGER,
  minutes INTEGER,
  option_count INTEGER,
  CHECK (
    (kind = 'format' AND question_count IS NOT NULL AND question_count > 0
      AND minutes IS NOT NULL AND minutes > 0 AND option_count IS NOT NULL AND option_count > 1)
    OR (kind = 'worked_examples' AND question_count IS NULL AND minutes IS NULL AND option_count IS NULL)
  )
);

CREATE UNIQUE INDEX thinking_sources_format ON thinking_sources(exam_goal) WHERE kind = 'format';

CREATE TABLE thinking_blueprints (
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  skill TEXT NOT NULL,
  title TEXT NOT NULL,
  method TEXT NOT NULL,
  authoring_rule TEXT NOT NULL,
  verification_rule TEXT NOT NULL,
  PRIMARY KEY (id, version)
);

CREATE TABLE thinking_blueprint_references (
  blueprint_id TEXT NOT NULL,
  blueprint_version INTEGER NOT NULL,
  source_id TEXT NOT NULL REFERENCES thinking_sources(id),
  question_number INTEGER NOT NULL CHECK (question_number > 0),
  PRIMARY KEY (blueprint_id, blueprint_version, source_id, question_number),
  FOREIGN KEY (blueprint_id, blueprint_version) REFERENCES thinking_blueprints(id, version)
);

INSERT INTO thinking_sources (id, exam_goal, kind, label, url, checked_on, question_count, minutes, option_count) VALUES
  ('nsw-selective-guide', 'selective', 'format', 'NSW Selective test guide', 'https://education.nsw.gov.au/schooling/students/oc-and-shs/going-to-a-selective-high-school/get-ready-for-the-selective-high-school-placement-test', '2026-11-07', 40, 40, 4),
  ('nsw-oc-guide', 'oc', 'format', 'NSW Opportunity Class test guide', 'https://education.nsw.gov.au/schooling/students/oc-and-shs/going-to-an-opportunity-class/get-ready-for-the-opportunity-class-placement-test', '2026-11-07', 30, 30, 4),
  ('nsw-selective-pt1-explanations', 'selective', 'worked_examples', 'NSW Selective sample practice test 1', 'https://education.nsw.gov.au/content/dam/main-education/schooling/parents-and-carers/choosing-a-school-setting/selective-high-schools-and-opportunity-classes-parents/documents/shs-practice-tests-2026-entry/PT1_SHS_thinking_skills_answers_explained.pdf', '2026-11-07', NULL, NULL, NULL),
  ('nsw-oc-pt1-explanations', 'oc', 'worked_examples', 'NSW OC sample practice test 1', 'https://education.nsw.gov.au/content/dam/main-education/schooling/parents-and-carers/choosing-a-school-setting/selective-high-schools-and-opportunity-classes-parents/documents/oc-practice-tests-2026-entry/PT1_OC_thinking_skills_answers_explained.pdf', '2026-11-07', NULL, NULL, NULL);

INSERT INTO thinking_blueprints (id, version, skill, title, method, authoring_rule, verification_rule) VALUES
  ('necessary-vs-sufficient', 1, 'Reasoning errors', 'A requirement and a guarantee', 'Translate the rule into an arrow. Check each claim in the direction the rule supports.', 'Write a new eligibility rule. Include a plausible option that treats meeting one requirement as a guarantee.', 'List the permitted cases. Exactly one option must describe what the stated rule guarantees.'),
  ('overlap-in-counts', 1, 'Reasoning errors', 'Counting overlapping groups', 'Check whether one person or object can be counted in both groups.', 'Use two new categories with a possible overlap. Make the tempting option add the group sizes directly.', 'Give a counterexample with an overlap and check that the other choices do not address the same error.'),
  ('unique-identification', 1, 'Hidden assumptions', 'A match must identify one object', 'Look for an alternative that also fits the clues. Identify what would rule it out.', 'Describe a new search or identification task where more than one candidate can share a feature.', 'Exhibit two candidates that satisfy the clues without the proposed assumption. Check that one option resolves the ambiguity.'),
  ('condition-chain', 1, 'Drawing conclusions', 'Follow a chain of conditions', 'Connect the rules in order and keep track of exclusions.', 'Use a new setting with two or three rules. Include a plausible claim that only holds in some valid cases.', 'Enumerate the valid cases. The chosen conclusion must hold in each one.'),
  ('direct-support', 1, 'Strengthen & weaken', 'Evidence that supports a claim', 'Restate the claim and ask which added fact provides a reason to accept it.', 'Write a new everyday claim. Contrast direct evidence with background facts about the same topic.', 'Explain the connection from each option to the stated claim and remove any second defensible answer.'),
  ('specific-counterevidence', 1, 'Strengthen & weaken', 'Evidence that weakens a claim', 'Find the argument’s key reason. Look for evidence that makes it less convincing.', 'Use a new argument with a clear reason. Add one fact that exposes a gap and three facts with weaker relevance.', 'Show how the selected fact reduces support for the actual conclusion.'),
  ('ordered-constraints', 1, 'Problem solving', 'Order items using constraints', 'Draw positions, place the fixed items, then rule out arrangements that break a clue.', 'Build an original row of positions and write compatible clues using adjacency or distance.', 'Enumerate all valid arrangements and verify that only one answer follows.'),
  ('fit-pieces', 1, 'Patterns & space', 'Fit shapes into a space', 'Track edges and positions. Check the fit of each complete arrangement.', 'Create new shapes and diagrams. State which rotations or flips are allowed.', 'Check every option for overlap, gaps and boundary fit. Verify the diagram against the solution.'),
  ('track-rotation', 1, 'Patterns & space', 'Track orientation after rotation', 'Choose an anchor and follow where it moves when the figure turns.', 'Use a newly drawn asymmetric shape with a marked feature and a clearly specified turn.', 'Calculate the feature positions after the permitted turns. Check that exactly one option matches.'),
  ('missing-information', 1, 'Relevant information', 'Choose facts needed to test a rule', 'Identify which missing facts could change whether a rule holds.', 'Build a new rule and a short table with some facts missing. Ask which entries must be checked.', 'For each necessary entry, construct a valid completion where its value changes the outcome.'),
  ('compare-differences', 1, 'Relevant information', 'Compare changes in a table', 'Calculate change from the matching before and after values for each row.', 'Use an original table with one largest change and a different largest final value.', 'Calculate every difference and check that the largest is unique.'),
  ('structure-then-calculate', 1, 'Mixed reasoning', 'Find the structure, then calculate', 'Work out how the quantities are related before doing the arithmetic.', 'Build a new multi-step problem with a small exact model. Give all relationships in the stem.', 'Solve the model independently and verify the intermediate quantities, units and unique final answer.');

INSERT INTO thinking_blueprint_references (blueprint_id, blueprint_version, source_id, question_number) VALUES
  ('necessary-vs-sufficient', 1, 'nsw-selective-pt1-explanations', 11),
  ('necessary-vs-sufficient', 1, 'nsw-oc-pt1-explanations', 5),
  ('overlap-in-counts', 1, 'nsw-selective-pt1-explanations', 9),
  ('unique-identification', 1, 'nsw-selective-pt1-explanations', 15),
  ('unique-identification', 1, 'nsw-oc-pt1-explanations', 8),
  ('condition-chain', 1, 'nsw-selective-pt1-explanations', 24),
  ('condition-chain', 1, 'nsw-oc-pt1-explanations', 20),
  ('direct-support', 1, 'nsw-selective-pt1-explanations', 14),
  ('direct-support', 1, 'nsw-oc-pt1-explanations', 2),
  ('specific-counterevidence', 1, 'nsw-selective-pt1-explanations', 35),
  ('ordered-constraints', 1, 'nsw-selective-pt1-explanations', 12),
  ('ordered-constraints', 1, 'nsw-oc-pt1-explanations', 29),
  ('fit-pieces', 1, 'nsw-selective-pt1-explanations', 10),
  ('fit-pieces', 1, 'nsw-oc-pt1-explanations', 22),
  ('track-rotation', 1, 'nsw-selective-pt1-explanations', 28),
  ('missing-information', 1, 'nsw-selective-pt1-explanations', 30),
  ('compare-differences', 1, 'nsw-oc-pt1-explanations', 19),
  ('structure-then-calculate', 1, 'nsw-selective-pt1-explanations', 37),
  ('structure-then-calculate', 1, 'nsw-oc-pt1-explanations', 13);
