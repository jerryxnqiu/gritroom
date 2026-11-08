-- Kid-facing reviews are written offline by Codex.
-- explanation_en: stem review from the question bank (shown right after an answer).
-- attempt_review_en: optional personalised note for an incorrect attempt.

ALTER TABLE practice_questions ADD COLUMN explanation_en TEXT
  CHECK (explanation_en IS NULL OR length(explanation_en) BETWEEN 1 AND 4000);

ALTER TABLE practice_attempts ADD COLUMN explanation_en TEXT
  CHECK (explanation_en IS NULL OR length(explanation_en) BETWEEN 1 AND 4000);

ALTER TABLE practice_attempts ADD COLUMN attempt_review_en TEXT
  CHECK (attempt_review_en IS NULL OR length(attempt_review_en) BETWEEN 1 AND 4000);

UPDATE practice_questions SET explanation_en = CASE id
  WHEN 'q-necessary-vs-sufficient' THEN
    '“Only if” means the stamp requires an on-time return. So if there is a stamp, the book was on time (B). It does not say every on-time book gets a stamp.'
  WHEN 'q-overlap-in-counts' THEN
    '12 + 10 = 22 is a count of memberships, not children. With 20 children, overlap is possible, so “exactly 22 children play a game” is not forced (C).'
  WHEN 'q-unique-identification' THEN
    'Colour and workbook still leave two bags. You need one more trait that only one bag has — the L name tag on exactly one of them (B).'
  WHEN 'q-condition-chain' THEN
    'If log → art → stay after school. She did not stay, so she did not join art, so she did not finish the log (C).'
  WHEN 'q-direct-support' THEN
    'Support needs a comparison that matches the claimed cause. Same plants nearer the window grew faster (B) directly backs “moved closer → grew faster”.'
  WHEN 'q-specific-counterevidence' THEN
    'The argument credits shirts for more goals. A rival cause in the same week — much more training (B) — weakens that link.'
  WHEN 'q-ordered-constraints' THEN
    'W must sit immediately left of Y, Z at an end, X not beside Z. Only X, W, Y, Z fits all three (C).'
  WHEN 'q-fit-pieces' THEN
    'Two 3-square L tiles need six small squares, but the tray has four. They cannot cover it without overlap or going outside (C).'
  WHEN 'q-track-rotation' THEN
    'A 180° turn in the plane sends the top point to where the bottom was. The star stays near that point on the flag (B).'
  WHEN 'q-missing-information' THEN
    'Express needs under 2 kg and fragile. Weight is known; the blank fragile mark is what you still must check for parcel 1 (B).'
  WHEN 'q-compare-differences' THEN
    'Rises: A 6, B 4, C 7. Town C had the largest rise (C).'
  WHEN 'q-structure-then-calculate' THEN
    'Let the equal legs be t seconds; first is t − 30. Total 3t − 30 = 360, so t = 130 and the first leg is 100 seconds (A).'
  ELSE explanation_en
END
WHERE id IN (
  'q-necessary-vs-sufficient', 'q-overlap-in-counts', 'q-unique-identification',
  'q-condition-chain', 'q-direct-support', 'q-specific-counterevidence',
  'q-ordered-constraints', 'q-fit-pieces', 'q-track-rotation',
  'q-missing-information', 'q-compare-differences', 'q-structure-then-calculate'
);
